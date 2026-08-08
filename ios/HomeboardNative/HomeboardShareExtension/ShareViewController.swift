import OSLog
import UIKit
import UniformTypeIdentifiers
@preconcurrency import Vision
import WebKit

private enum ScanEvidenceRole: Equatable {
  case primary
  case supporting
}

private struct LoadedSharePayload {
  var url: URL?
  var title: String?
  var preprocessedValues: [String: Any]?
}

private enum HomeboardSharePalette {
  static let background = UIColor(red: 61 / 255, green: 80 / 255, blue: 74 / 255, alpha: 1)
  static let surface = UIColor(red: 75 / 255, green: 97 / 255, blue: 89 / 255, alpha: 1)
  static let surfaceDeep = UIColor(red: 49 / 255, green: 68 / 255, blue: 62 / 255, alpha: 1)
  static let accent = UIColor(red: 249 / 255, green: 226 / 255, blue: 205 / 255, alpha: 1)
  static let primaryText = UIColor(red: 255 / 255, green: 243 / 255, blue: 229 / 255, alpha: 1)
  static let secondaryText = UIColor(red: 231 / 255, green: 218 / 255, blue: 206 / 255, alpha: 1)
  static let border = UIColor(red: 146 / 255, green: 167 / 255, blue: 158 / 255, alpha: 1)
  static let buttonText = UIColor(red: 36 / 255, green: 49 / 255, blue: 41 / 255, alpha: 1)
  static let danger = UIColor(red: 255 / 255, green: 180 / 255, blue: 171 / 255, alpha: 1)
}

final class ShareViewController: UIViewController {
  private let logger = Logger(
    subsystem: "com.homeboard.native",
    category: "VisualListingImport"
  )

  private let rootStack = UIStackView()
  private let browserContainer = UIView()
  private let providerLabel = UILabel()
  private let progressLabel = UILabel()
  private let reviewButton = UIButton(type: .system)
  private let quickScanButton = UIButton(type: .system)
  private let moreButton = UIButton(type: .system)
  private let scannerFrame = UIView()
  private let loadingView = UIActivityIndicatorView(style: .medium)

  private lazy var webView: WKWebView = {
    let configuration = WKWebViewConfiguration()
    configuration.websiteDataStore = .default()
    configuration.defaultWebpagePreferences.allowsContentJavaScript = true
    let webView = WKWebView(frame: .zero, configuration: configuration)
    webView.navigationDelegate = self
    webView.scrollView.delegate = self
    webView.scrollView.keyboardDismissMode = .interactive
    webView.allowsBackForwardNavigationGestures = false
    webView.customUserAgent =
      "Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) "
      + "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1"
    return webView
  }()

  private var sharedURL: URL?
  private var sharedTitle: String?
  private var safariPreprocessedValues: [String: Any]?
  private var completedSafariAnalysis: HomeboardListingAnalysis?
  private var extractedValues: [String: Any] = [:]
  private var evidenceSegments: [String] = []
  private var primaryEvidenceSegments: [String] = []
  private var evidenceKeys = Set<String>()
  private var addressEvidence: [HomeboardAddressEvidence] = []
  private var addressWasManuallyCorrected = false
  private var manuallyCorrectedFields = Set<String>()
  private var scannedOffsets = Set<Int>()
  private var scanWorkItem: DispatchWorkItem?
  private var quickScanTask: Task<Void, Never>?
  private var modelAnalysisTask: Task<HomeboardListingScanResult, Never>?
  private var highlightAnimationTask: Task<Void, Never>?
  private var isScanning = false
  private var isQuickScanning = false
  private var hasStartedHighlightedScan = false
  private var scanCount = 0
  private var pageFinishedLoading = false
  private var hasConfiguredLayout = false
  private var hasResolvedSharedPayload = false
  private var browserMinimumHeightConstraint: NSLayoutConstraint?
  private let deliberateScanDelay: TimeInterval = 0.75
  private let sharedPayloadDeadline: TimeInterval = 4.5

  private let backgroundColor = HomeboardSharePalette.background
  private let surfaceColor = HomeboardSharePalette.surface
  private let accentColor = HomeboardSharePalette.accent

  override func viewDidLoad() {
    super.viewDidLoad()
    showInteractiveInterface()
    loadSharedURL()
  }

  deinit {
    scanWorkItem?.cancel()
    quickScanTask?.cancel()
    modelAnalysisTask?.cancel()
    highlightAnimationTask?.cancel()
  }

  private func configureLayout() {
    let header = makeHeader()
    configureBrowser()
    let controls = makeControls()

    rootStack.axis = .vertical
    rootStack.spacing = 8
    rootStack.translatesAutoresizingMaskIntoConstraints = false
    rootStack.addArrangedSubview(header)
    rootStack.addArrangedSubview(browserContainer)
    rootStack.addArrangedSubview(controls)
    view.addSubview(rootStack)

    browserContainer.setContentHuggingPriority(.defaultLow, for: .vertical)
    browserContainer.setContentCompressionResistancePriority(.defaultLow, for: .vertical)

    browserMinimumHeightConstraint = browserContainer.heightAnchor.constraint(
      greaterThanOrEqualToConstant: 330
    )
    browserMinimumHeightConstraint?.isActive = true

    NSLayoutConstraint.activate([
      rootStack.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 8),
      rootStack.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 12),
      rootStack.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -12),
      rootStack.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor, constant: -8)
    ])
  }

  private func makeHeader() -> UIView {
    let brand = UILabel()
    brand.text = "HOMEBOARD"
    brand.textColor = accentColor
    brand.font = .systemFont(ofSize: 10, weight: .heavy)
    brand.setContentHuggingPriority(.required, for: .horizontal)

    providerLabel.text = "Opening shared listing"
    providerLabel.textColor = HomeboardSharePalette.primaryText
    providerLabel.font = .systemFont(ofSize: 16, weight: .bold)
    providerLabel.lineBreakMode = .byTruncatingTail

    let closeButton = UIButton(type: .system)
    closeButton.setImage(UIImage(systemName: "xmark"), for: .normal)
    closeButton.tintColor = HomeboardSharePalette.secondaryText
    closeButton.backgroundColor = HomeboardSharePalette.surfaceDeep.withAlphaComponent(0.72)
    closeButton.layer.cornerRadius = 16
    closeButton.translatesAutoresizingMaskIntoConstraints = false
    closeButton.addTarget(self, action: #selector(cancel), for: .touchUpInside)
    NSLayoutConstraint.activate([
      closeButton.widthAnchor.constraint(equalToConstant: 32),
      closeButton.heightAnchor.constraint(equalToConstant: 32)
    ])

    let labels = UIStackView(arrangedSubviews: [brand, providerLabel])
    labels.axis = .vertical
    labels.spacing = 2

    let header = UIStackView(arrangedSubviews: [labels, closeButton])
    header.axis = .horizontal
    header.alignment = .center
    header.spacing = 10
    return header
  }

  private func configureBrowser() {
    browserContainer.backgroundColor = surfaceColor
    browserContainer.layer.cornerRadius = 18
    browserContainer.layer.cornerCurve = .continuous
    browserContainer.layer.masksToBounds = true

    webView.translatesAutoresizingMaskIntoConstraints = false
    browserContainer.addSubview(webView)

    let topFade = CAGradientLayer()
    topFade.colors = [
      backgroundColor.withAlphaComponent(0.64).cgColor,
      UIColor.clear.cgColor
    ]
    topFade.startPoint = CGPoint(x: 0.5, y: 0)
    topFade.endPoint = CGPoint(x: 0.5, y: 1)
    topFade.name = "topFade"
    browserContainer.layer.addSublayer(topFade)

    scannerFrame.isUserInteractionEnabled = false
    scannerFrame.layer.cornerRadius = 13
    scannerFrame.layer.cornerCurve = .continuous
    scannerFrame.layer.borderWidth = 0
    scannerFrame.backgroundColor = .clear
    scannerFrame.translatesAutoresizingMaskIntoConstraints = false
    browserContainer.addSubview(scannerFrame)

    loadingView.color = accentColor
    loadingView.translatesAutoresizingMaskIntoConstraints = false
    browserContainer.addSubview(loadingView)
    loadingView.startAnimating()

    NSLayoutConstraint.activate([
      webView.topAnchor.constraint(equalTo: browserContainer.topAnchor),
      webView.leadingAnchor.constraint(equalTo: browserContainer.leadingAnchor),
      webView.trailingAnchor.constraint(equalTo: browserContainer.trailingAnchor),
      webView.bottomAnchor.constraint(equalTo: browserContainer.bottomAnchor),
      scannerFrame.topAnchor.constraint(equalTo: browserContainer.topAnchor, constant: 10),
      scannerFrame.leadingAnchor.constraint(equalTo: browserContainer.leadingAnchor, constant: 10),
      scannerFrame.trailingAnchor.constraint(equalTo: browserContainer.trailingAnchor, constant: -10),
      scannerFrame.bottomAnchor.constraint(equalTo: browserContainer.bottomAnchor, constant: -10),
      loadingView.centerXAnchor.constraint(equalTo: browserContainer.centerXAnchor),
      loadingView.centerYAnchor.constraint(equalTo: browserContainer.centerYAnchor)
    ])
  }

  override func viewDidLayoutSubviews() {
    super.viewDidLayoutSubviews()
    browserContainer.layer.sublayers?
      .first(where: { $0.name == "topFade" })?
      .frame = CGRect(x: 0, y: 0, width: browserContainer.bounds.width, height: 44)
  }

  private func makeControls() -> UIView {
    progressLabel.text = "Loading the listing page…"
    progressLabel.textColor = HomeboardSharePalette.primaryText
    progressLabel.font = .systemFont(ofSize: 13, weight: .semibold)
    progressLabel.numberOfLines = 2

    var moreConfiguration = UIButton.Configuration.gray()
    moreConfiguration.image = UIImage(systemName: "ellipsis")
    moreConfiguration.cornerStyle = .capsule
    moreConfiguration.baseForegroundColor = HomeboardSharePalette.secondaryText
    moreConfiguration.baseBackgroundColor = HomeboardSharePalette.surfaceDeep.withAlphaComponent(0.72)
    moreButton.configuration = moreConfiguration
    moreButton.addTarget(self, action: #selector(showCaptureOptions), for: .touchUpInside)
    moreButton.isEnabled = false
    moreButton.accessibilityLabel = "Capture options"
    moreButton.translatesAutoresizingMaskIntoConstraints = false
    NSLayoutConstraint.activate([
      moreButton.widthAnchor.constraint(equalToConstant: 42),
      moreButton.heightAnchor.constraint(equalToConstant: 36)
    ])

    var reviewConfiguration = UIButton.Configuration.filled()
    reviewConfiguration.title = "Review details"
    reviewConfiguration.image = UIImage(systemName: "checkmark.circle.fill")
    reviewConfiguration.imagePadding = 7
    reviewConfiguration.cornerStyle = .medium
    reviewConfiguration.baseForegroundColor = backgroundColor
    reviewConfiguration.baseBackgroundColor = accentColor
    reviewButton.configuration = reviewConfiguration
    reviewButton.addTarget(self, action: #selector(reviewDetails), for: .touchUpInside)
    reviewButton.isEnabled = false
    reviewButton.alpha = 0.45
    reviewButton.heightAnchor.constraint(equalToConstant: 48).isActive = true

    var quickScanConfiguration = UIButton.Configuration.gray()
    quickScanConfiguration.title = "Scan page"
    quickScanConfiguration.image = UIImage(systemName: "viewfinder")
    quickScanConfiguration.imagePadding = 6
    quickScanConfiguration.cornerStyle = .medium
    quickScanConfiguration.baseForegroundColor = HomeboardSharePalette.primaryText
    quickScanConfiguration.baseBackgroundColor = HomeboardSharePalette.surfaceDeep.withAlphaComponent(0.76)
    quickScanButton.configuration = quickScanConfiguration
    quickScanButton.addTarget(self, action: #selector(quickScanTapped), for: .touchUpInside)
    quickScanButton.isEnabled = false
    quickScanButton.heightAnchor.constraint(equalToConstant: 48).isActive = true

    let statusRow = UIStackView(arrangedSubviews: [progressLabel, moreButton])
    statusRow.axis = .horizontal
    statusRow.alignment = .center
    statusRow.spacing = 10

    let actionRow = UIStackView(arrangedSubviews: [quickScanButton, reviewButton])
    actionRow.axis = .horizontal
    actionRow.distribution = .fillEqually
    actionRow.spacing = 8

    let controls = UIStackView(
      arrangedSubviews: [statusRow, actionRow]
    )
    controls.axis = .vertical
    controls.spacing = 8
    controls.isLayoutMarginsRelativeArrangement = true
    controls.layoutMargins = UIEdgeInsets(top: 4, left: 2, bottom: 0, right: 2)
    return controls
  }

  private func loadSharedURL() {
    let inputItems = extensionContext?
      .inputItems
      .compactMap { $0 as? NSExtensionItem } ?? []
    let providers = inputItems.flatMap { $0.attachments ?? [] }

    let itemText = inputItems.flatMap {
      [$0.attributedContentText?.string, $0.attributedTitle?.string].compactMap { $0 }
    }
    sharedTitle = itemText
      .map(cleanedTitle)
      .first(where: { !$0.isEmpty })
    sharedURL = itemText.compactMap(firstWebURL).first

    guard !providers.isEmpty else {
      showShareInputFailure()
      return
    }

    let group = DispatchGroup()
    let lock = NSLock()
    for provider in providers {
      let typeIdentifiers = readableTypeIdentifiers(for: provider)
      logger.debug(
        "Share provider types: \(provider.registeredTypeIdentifiers.joined(separator: ", "), privacy: .public)"
      )
      for typeIdentifier in typeIdentifiers {
        group.enter()
        provider.loadItem(forTypeIdentifier: typeIdentifier, options: nil) {
          [weak self] item, error in
          defer { group.leave() }
          guard let self else { return }
          if let error {
            self.logger.error(
              "Could not load shared type \(typeIdentifier, privacy: .public): \(error.localizedDescription, privacy: .public)"
            )
            return
          }
          let payload = self.decodeSharePayload(item)
          lock.lock()
          if self.sharedURL == nil {
            self.sharedURL = payload.url
          }
          if self.sharedTitle == nil {
            self.sharedTitle = payload.title
          }
          if let preprocessedValues = payload.preprocessedValues {
            self.safariPreprocessedValues = preprocessedValues
          }
          lock.unlock()
          if payload.preprocessedValues != nil {
            DispatchQueue.main.async { [weak self] in
              self?.finishLoadingSharedPayload()
            }
          }
        }
      }
    }

    group.notify(queue: .main) { [weak self] in
      self?.finishLoadingSharedPayload()
    }
    DispatchQueue.main.asyncAfter(
      deadline: .now() + sharedPayloadDeadline
    ) { [weak self] in
      self?.finishLoadingSharedPayload()
    }
  }

  private func finishLoadingSharedPayload() {
    guard !hasResolvedSharedPayload else { return }
    hasResolvedSharedPayload = true

    if let safariPreprocessedValues {
      openPreprocessedSafariPage(safariPreprocessedValues)
    } else if
      let sharedURL,
      ["http", "https"].contains(sharedURL.scheme?.lowercased() ?? "")
    {
      progressLabel.text = "Safari shared the page link. Opening it for a quick scan…"
      openSharedPage()
    } else {
      showShareInputFailure()
    }
  }

  private func readableTypeIdentifiers(for provider: NSItemProvider) -> [String] {
    let preferred = [
      UTType.propertyList.identifier,
      UTType.url.identifier,
      UTType.plainText.identifier
    ]
    var identifiers: [String] = []
    for identifier in preferred where
      provider.hasItemConformingToTypeIdentifier(identifier)
      && !identifiers.contains(identifier)
    {
      identifiers.append(identifier)
    }
    for identifier in provider.registeredTypeIdentifiers where !identifiers.contains(identifier) {
      let lowercased = identifier.lowercased()
      let type = UTType(identifier)
      let isReadable =
        type?.conforms(to: .propertyList) == true
        || type?.conforms(to: .url) == true
        || type?.conforms(to: .text) == true
        || lowercased.contains("property-list")
        || lowercased.contains("plist")
        || lowercased.contains("url")
        || lowercased.contains("text")
      if isReadable {
        identifiers.append(identifier)
      }
    }
    return identifiers
  }

  private func decodeSharePayload(_ item: Any?) -> LoadedSharePayload {
    guard let item else { return LoadedSharePayload() }
    if let url = item as? URL {
      return LoadedSharePayload(url: url)
    }
    if let url = item as? NSURL {
      return LoadedSharePayload(url: url as URL)
    }
    if let attributedText = item as? NSAttributedString {
      let text = attributedText.string
      return LoadedSharePayload(
        url: firstWebURL(in: text),
        title: cleanedTitle(text)
      )
    }
    if let text = item as? String {
      return LoadedSharePayload(
        url: firstWebURL(in: text) ?? URL(string: text),
        title: cleanedTitle(text)
      )
    }
    if let data = item as? Data {
      if
        let propertyList = try? PropertyListSerialization.propertyList(
          from: data,
          options: [],
          format: nil
        )
      {
        return decodeSharePayload(propertyList)
      }
      if let text = String(data: data, encoding: .utf8) {
        return decodeSharePayload(text)
      }
    }
    guard let dictionary = stringDictionary(item) else {
      return LoadedSharePayload()
    }
    let wrappedResults = stringDictionary(
      dictionary[NSExtensionJavaScriptPreprocessingResultsKey]
    )
    let results = wrappedResults ?? dictionary
    let url = dictionaryURL(
      in: results,
      keys: ["url", "baseURI", "canonicalURL", "shareURL"]
    )
    let title = dictionaryString(
      in: results,
      keys: ["pageTitle", "title", "name"]
    ).map(cleanedTitle)
    let isSafariPageCapture =
      dictionaryBool(in: results, key: "safariPageCapture")
      || results["pageEvidence"] != nil
      || results["secondaryPageEvidence"] != nil
    return LoadedSharePayload(
      url: url,
      title: title,
      preprocessedValues: wrappedResults != nil || isSafariPageCapture ? results : nil
    )
  }

  private func stringDictionary(_ item: Any?) -> [String: Any]? {
    if let dictionary = item as? [String: Any] {
      return dictionary
    }
    guard let dictionary = item as? NSDictionary else { return nil }
    var result: [String: Any] = [:]
    for (key, value) in dictionary {
      if let key = key as? String {
        result[key] = value
      }
    }
    return result
  }

  private func dictionaryString(
    in dictionary: [String: Any],
    keys: [String]
  ) -> String? {
    for key in keys {
      if let value = dictionary[key] as? String {
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        if !trimmed.isEmpty { return trimmed }
      }
      if let value = dictionary[key] as? URL {
        return value.absoluteString
      }
    }
    return nil
  }

  private func dictionaryURL(
    in dictionary: [String: Any],
    keys: [String]
  ) -> URL? {
    for key in keys {
      if let url = dictionary[key] as? URL { return url }
      if
        let value = dictionary[key] as? String,
        let url = firstWebURL(in: value) ?? URL(string: value),
        ["http", "https"].contains(url.scheme?.lowercased() ?? "")
      {
        return url
      }
    }
    return nil
  }

  private func dictionaryBool(
    in dictionary: [String: Any],
    key: String
  ) -> Bool {
    (dictionary[key] as? Bool)
      ?? (dictionary[key] as? NSNumber)?.boolValue
      ?? false
  }

  private func openPreprocessedSafariPage(_ values: [String: Any]) {
    guard
      let rawURL = values["url"] as? String,
      let url = URL(string: rawURL),
      ["http", "https"].contains(url.scheme?.lowercased() ?? "")
    else {
      showFailure("Safari did not provide a valid listing page.")
      return
    }

    sharedURL = url
    extractedValues = values
    extractedValues["url"] = rawURL
    extractedValues["sourceName"] = providerName(url.host)
    openSharedPage()
  }

  private func openSharedPage() {
    showInteractiveInterface()
    guard
      let sharedURL,
      ["http", "https"].contains(sharedURL.scheme?.lowercased() ?? "")
    else {
      showFailure("Share the listing page itself so Homeboard can open it.")
      return
    }

    extractedValues["url"] = sharedURL.absoluteString
    extractedValues["sourceName"] = providerName(sharedURL.host)
    if let sharedTitle {
      extractedValues["pageTitle"] = sharedTitle
    }
    providerLabel.text = providerName(sharedURL.host) ?? sharedURL.host ?? "Shared listing"
    progressLabel.text = "Opening the page for visual scan…"

    var request = URLRequest(url: sharedURL)
    request.timeoutInterval = 18
    request.cachePolicy = .returnCacheDataElseLoad
    webView.load(request)
  }

  @objc private func scanVisibleTapped() {
    scheduleScan(force: true, delay: 0)
  }

  @objc private func quickScanTapped() {
    if isQuickScanning {
      modelAnalysisTask?.cancel()
      highlightAnimationTask?.cancel()
      quickScanTask?.cancel()
      return
    }

    quickScanTask = Task { [weak self] in
      guard let self else { return }
      if self.safariPreprocessedValues != nil {
        self.hasStartedHighlightedScan = false
        self.completedSafariAnalysis = nil
        await self.runHighlightedPageScan()
      } else {
        await self.quickScanPage()
      }
    }
  }

  @objc private func showCaptureOptions() {
    let alert = UIAlertController(
      title: "Capture options",
      message: nil,
      preferredStyle: .actionSheet
    )
    alert.addAction(UIAlertAction(
      title: "Scan this section now",
      style: .default
    ) { [weak self] _ in
      self?.scanVisibleTapped()
    })
    alert.addAction(UIAlertAction(
      title: "Use selected text to correct a field",
      style: .default
    ) { [weak self] _ in
      self?.useSelectedTextTapped()
    })
    alert.addAction(UIAlertAction(
      title: "How capture works",
      style: .default
    ) { [weak self] _ in
      self?.showCaptureHelp()
    })
    alert.addAction(UIAlertAction(title: "Cancel", style: .cancel))
    if let popover = alert.popoverPresentationController {
      popover.sourceView = moreButton
      popover.sourceRect = moreButton.bounds
    }
    present(alert, animated: true)
  }

  private func showCaptureHelp() {
    let alert = UIAlertController(
      title: "Scan, review, save",
      message: """
      Homeboard automatically follows the main listing sentence by sentence and highlights the current line in the Homeboard palette.

      Similar and nearby listing cards are skipped. If a core detail is still missing, Homeboard takes one quick second look and then tells you exactly what needs review.

      If a field is wrong, select the exact webpage text, open Capture options, and choose the field it should replace.
      """,
      preferredStyle: .alert
    )
    alert.addAction(UIAlertAction(title: "Got it", style: .default))
    present(alert, animated: true)
  }

  @objc private func useSelectedTextTapped() {
    webView.evaluateJavaScript("window.getSelection ? window.getSelection().toString() : ''") {
      [weak self] value, _ in
      DispatchQueue.main.async {
        guard let self else { return }
        let selected = (value as? String)?
          .trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        guard !selected.isEmpty else {
          self.progressLabel.text = "Select the exact text on the page first."
          return
        }
        self.presentFieldPicker(for: selected)
      }
    }
  }

  private func presentFieldPicker(for selectedText: String) {
    let preview = selectedText
      .replacingOccurrences(of: #"\s+"#, with: " ", options: .regularExpression)
      .prefix(90)
    let alert = UIAlertController(
      title: "Replace a scanned field",
      message: "Use “\(preview)” as:",
      preferredStyle: .actionSheet
    )
    let fields: [(String, String)] = [
      ("Street address", "address"),
      ("Unit", "unit"),
      ("Neighborhood", "neighborhood"),
      ("Monthly rent", "price"),
      ("Bedrooms", "bedrooms"),
      ("Bathrooms", "bathrooms"),
      ("Add as an amenity", "amenity")
    ]
    for (label, key) in fields {
      alert.addAction(UIAlertAction(title: label, style: .default) { [weak self] _ in
        self?.overwriteField(key, with: selectedText)
      })
    }
    alert.addAction(UIAlertAction(title: "Cancel", style: .cancel))
    if let popover = alert.popoverPresentationController {
      popover.sourceView = moreButton
      popover.sourceRect = moreButton.bounds
    }
    present(alert, animated: true)
  }

  private func overwriteField(_ key: String, with selectedText: String) {
    let cleaned = selectedText
      .replacingOccurrences(of: #"\s+"#, with: " ", options: .regularExpression)
      .trimmingCharacters(in: .whitespacesAndNewlines)
    guard !cleaned.isEmpty else { return }

    switch key {
    case "address":
      extractedValues[key] = cleaned
      addressWasManuallyCorrected = true
    case "unit":
      let value = cleaned
        .replacingOccurrences(
          of: #"^(?:unit|apt|apartment|#)\s*"#,
          with: "",
          options: [.regularExpression, .caseInsensitive]
        )
        .uppercased()
      extractedValues[key] = value
    case "price":
      guard let value = selectedNumber(
        in: cleaned,
        pattern: #"\$?\s*([0-9]{1,3}(?:,[0-9]{3})+|[0-9]{3,6})(?:\.\d{1,2})?"#
      ) else {
        progressLabel.text = "That selection does not contain a monthly rent."
        return
      }
      extractedValues[key] = value
    case "bedrooms":
      if cleaned.range(of: #"\bstudio\b"#, options: [.regularExpression, .caseInsensitive]) != nil {
        extractedValues[key] = 0
      } else if let value = selectedNumber(
        in: cleaned,
        pattern: #"\b(\d+(?:\.\d+)?)\s*(?:bd|bed|beds|bedroom|bedrooms)\b"#
      ) {
        extractedValues[key] = value
      } else {
        progressLabel.text = "That selection does not contain a bedroom count."
        return
      }
    case "bathrooms":
      guard let value = selectedNumber(
        in: cleaned,
        pattern: #"\b(\d+(?:\.\d+)?)\s*(?:ba|bath|baths|bathroom|bathrooms)\b"#
      ) else {
        progressLabel.text = "That selection does not contain a bathroom count."
        return
      }
      extractedValues[key] = value
    case "amenity":
      mergeAmenities([cleaned])
    default:
      extractedValues[key] = cleaned
    }
    manuallyCorrectedFields.insert(key)

    progressLabel.text = key == "amenity"
      ? "Selected text added as an amenity."
      : "\(fieldLabel(for: key)) replaced from selected text."
  }

  private func selectedNumber(in text: String, pattern: String) -> Double? {
    firstMatch(in: text, pattern: pattern).flatMap(numeric)
  }

  private func fieldLabel(for key: String) -> String {
    [
      "address": "Address",
      "unit": "Unit",
      "neighborhood": "Neighborhood",
      "price": "Rent",
      "bedrooms": "Bedrooms",
      "bathrooms": "Bathrooms"
    ][key] ?? "Field"
  }

  private func scheduleScan(force: Bool = false, delay: TimeInterval? = nil) {
    guard pageFinishedLoading else { return }
    scanWorkItem?.cancel()
    let dwell = delay ?? deliberateScanDelay
    if !force {
      progressLabel.text = "Pause on the details you want to capture…"
    }
    let item = DispatchWorkItem { [weak self] in
      guard let self else { return }
      Task { await self.scanVisibleViewport(force: force) }
    }
    scanWorkItem = item
    DispatchQueue.main.asyncAfter(deadline: .now() + dwell, execute: item)
  }

  @MainActor
  private func scanVisibleViewport(force: Bool) async {
    await captureVisibleViewport(
      force: force,
      role: .primary,
      updatesProgress: true
    )
  }

  @MainActor
  private func quickScanPage() async {
    guard pageFinishedLoading, !isScanning, !isQuickScanning else { return }

    scanWorkItem?.cancel()
    isQuickScanning = true
    scannedOffsets.removeAll()
    clearAutomaticallyCapturedPrimaryFacts()
    updateQuickScanControls(isRunning: true)

    let originalOffset = webView.scrollView.contentOffset
    let viewportHeight = max(webView.bounds.height, 1)
    let step = max(viewportHeight * 0.82, 280)
    var targetOffset: CGFloat = 0
    var section = 0

    while section < 24 {
      guard !Task.isCancelled else { break }
      let contentHeight = max(webView.scrollView.contentSize.height, viewportHeight)
      let maximumOffset = max(contentHeight - viewportHeight, 0)
      let offset = min(targetOffset, maximumOffset)
      progressLabel.text = "Quick Scan · reading section \(section + 1)"
      await moveWebView(to: offset)
      guard !Task.isCancelled else { break }
      await captureVisibleViewport(
        force: true,
        role: section == 0 ? .primary : .supporting,
        updatesProgress: false,
        usesOCR: section == 0 || section.isMultiple(of: 5)
      )
      section += 1

      if offset >= maximumOffset - 2 {
        try? await Task.sleep(for: .milliseconds(350))
        let expandedHeight = max(webView.scrollView.contentSize.height, viewportHeight)
        let expandedMaximum = max(expandedHeight - viewportHeight, 0)
        if expandedMaximum <= maximumOffset + 12 {
          break
        }
      }
      targetOffset = offset + step
    }

    if !Task.isCancelled {
      progressLabel.text = "Quick Scan · organizing the loaded page"
      let semanticResult = await collectBrowserEvidence(wholePage: true)
      absorbBrowserMetadata(semanticResult)
      if let semanticText = semanticResult["visibleText"] as? String {
        let cleanedSemanticText = String(semanticText.prefix(32_000))
        extractedValues["semanticPageEvidence"] = cleanedSemanticText
        mergeAmenities(detectedAmenities(in: cleanedSemanticText))
      }
    }

    webView.scrollView.setContentOffset(originalOffset, animated: false)
    isQuickScanning = false
    updateQuickScanControls(isRunning: false)
    progressLabel.text = Task.isCancelled
      ? "Quick Scan stopped. \(progressText())"
      : "Quick Scan complete. \(progressText())"
    quickScanTask = nil
  }

  @MainActor
  private func runHighlightedPageScan() async {
    guard pageFinishedLoading, !isScanning, !isQuickScanning else { return }
    guard !hasStartedHighlightedScan else { return }

    hasStartedHighlightedScan = true
    isQuickScanning = true
    scanWorkItem?.cancel()
    webView.scrollView.isScrollEnabled = false
    updateQuickScanControls(isRunning: true)
    progressLabel.text = "Capturing a stable snapshot of the listing…"

    let browserResult = await collectBrowserEvidence(wholePage: true)
    guard !Task.isCancelled else {
      webView.scrollView.isScrollEnabled = true
      isQuickScanning = false
      updateQuickScanControls(isRunning: false)
      quickScanTask = nil
      return
    }
    absorbBrowserMetadata(browserResult)
    let originalPageEvidence = string("pageEvidence")
    let originalPrimaryEvidence = string("primaryPageEvidence")
    let manualEvidence = evidenceSegments.joined(separator: "\n\n---\n\n")
    var semanticEvidence: String?
    if let semanticText = browserResult["visibleText"] as? String {
      let cleanedSemanticText = String(semanticText.prefix(32_000))
      semanticEvidence = cleanedSemanticText
      extractedValues["semanticPageEvidence"] = cleanedSemanticText
      mergeAmenities(detectedAmenities(in: cleanedSemanticText))
    }
    extractedValues["primaryPageEvidence"] = String(
      [
        originalPrimaryEvidence,
        string("primaryFactEvidence"),
        originalPageEvidence
      ]
        .compactMap { $0 }
        .joined(separator: "\n\n")
        .prefix(14_000)
    )
    extractedValues["pageEvidence"] = String(
      [
        originalPageEvidence,
        semanticEvidence,
        manualEvidence.isEmpty ? nil : manualEvidence
      ]
        .compactMap { $0 }
        .joined(separator: "\n\n")
        .prefix(24_000)
    )

    let frozenValues = extractedValues
    modelAnalysisTask = Task { @MainActor in
      await HomeboardListingIntelligence.analyzeWithOneRescan(
        message: frozenValues,
        allowSystemModel: true
      )
    }
    let minimumAnimationTask = Task<Void, Never> {
      do {
        try await Task.sleep(for: .milliseconds(700))
      } catch {
        // Cancellation should release the share extension immediately.
      }
    }
    let sentenceCount = await installPageHighlightScanner()
    highlightAnimationTask = Task { @MainActor [weak self] in
      await self?.animatePageHighlights(sentenceCount: sentenceCount)
    }

    guard let modelAnalysisTask else { return }
    let scan = await modelAnalysisTask.value
    await minimumAnimationTask.value
    highlightAnimationTask?.cancel()
    _ = await highlightAnimationTask?.result
    self.modelAnalysisTask = nil
    highlightAnimationTask = nil

    guard !Task.isCancelled else {
      await finishPageHighlight(status: "Scan paused")
      webView.scrollView.isScrollEnabled = true
      isQuickScanning = false
      updateQuickScanControls(isRunning: false)
      quickScanTask = nil
      return
    }

    completedSafariAnalysis = scan.analysis
    applyAnalysisFacts(scan.analysis)

    let missing = scan.analysis.missingFields
    let completionName = scan.analysis.usedOnDeviceModel
      ? "On-device model complete"
      : "Scan complete"
    if missing.isEmpty {
      progressLabel.text =
        "\(completionName). All core details found."
    } else {
      progressLabel.text =
        "\(completionName). Still missing: \(naturalList(missing))."
    }
    await finishPageHighlight(
      status: missing.isEmpty
        ? completionName
        : "\(missing.count) field\(missing.count == 1 ? "" : "s") need review"
    )

    webView.scrollView.isScrollEnabled = true
    isQuickScanning = false
    updateQuickScanControls(isRunning: false)
    quickScanButton.configuration?.title = "Scan again"
    reviewButton.isEnabled = true
    reviewButton.alpha = 1
    quickScanTask = nil
  }

  @MainActor
  private func animatePageHighlights(sentenceCount: Int) async {
    guard sentenceCount > 0 else { return }
    for index in 0..<sentenceCount {
      guard !Task.isCancelled else { return }
      progressLabel.text = "Following sentence \(index + 1) of \(sentenceCount)…"
      _ = await highlightPageSentence(at: index)
      scanCount += 1
      do {
        try await Task.sleep(for: .milliseconds(90))
      } catch {
        return
      }
    }
    guard !Task.isCancelled else { return }
    progressLabel.text = "Organizing the frozen listing evidence…"
    await finishPageHighlight(status: "Understanding details")
  }

  @MainActor
  private func installPageHighlightScanner() async -> Int {
    let script = """
    (() => {
      if (window.__homeboardSentenceScan?.cleanup) {
        window.__homeboardSentenceScan.cleanup();
      }

      const recommendationPattern =
        /similar homes|similar listings|similar results|recommended|you may also like|homes you may like|nearby homes|nearby rentals|other rentals|other available homes|more homes|homes for you/i;
      const recommendationRoots = new Set(Array.from(document.querySelectorAll(
        '[data-testid*="recommend" i],[data-testid*="similar" i],'
        + '[data-testid*="nearby" i],[aria-label*="recommend" i],'
        + '[aria-label*="similar" i],[aria-label*="nearby" i],'
        + '[class*="recommend" i],[class*="similar" i]'
      )));
      for (const heading of document.querySelectorAll('h2,h3,h4,[role="heading"]')) {
        const text = (heading.innerText || heading.textContent || '').trim();
        if (!recommendationPattern.test(text)) continue;
        const root = heading.closest('section,aside,[role="region"]')
          || heading.parentElement;
        if (root) recommendationRoots.add(root);
      }

      const belongsToRecommendation = element => {
        for (const root of recommendationRoots) {
          if (root === element || root.contains(element)) return true;
        }
        return false;
      };
      const linksToAnotherListing = element => {
        const link = element.closest('a[href]');
        if (!link) return false;
        try {
          const target = new URL(link.href, location.href);
          const listingPath =
            /\\/(?:homedetails|apartments|building|realestateandhomes-detail)\\//i;
          return target.host === location.host
            && target.pathname !== location.pathname
            && listingPath.test(target.pathname);
        } catch (_) {
          return false;
        }
      };
      const isExcluded = element => {
        if (!element || element.closest(
          'nav,footer,aside,form,[role="navigation"],[role="dialog"]'
        )) return true;
        return belongsToRecommendation(element)
          || linksToAnotherListing(element);
      };

      const mainSelectors = [
        'main h1', 'main h2', 'main h3', 'main p', 'main li',
        'main dt', 'main dd', 'main address',
        'article h1', 'article h2', 'article h3', 'article p', 'article li',
        '[role="main"] h1', '[role="main"] h2', '[role="main"] h3',
        '[role="main"] p', '[role="main"] li',
        '[itemprop="streetAddress"]', '[itemprop="address"]',
        '[data-testid*="address" i]', '[data-testid="price"]',
        '[data-testid*="monthly-rent" i]', '[data-testid*="bed-bath" i]',
        '[aria-label*="monthly rent" i]', '[aria-label*="bedroom" i]',
        '[aria-label*="bathroom" i]'
      ];
      let containers = Array.from(document.querySelectorAll(
        mainSelectors.join(',')
      ));
      if (!containers.length) {
        containers = Array.from(document.querySelectorAll(
          'h1,h2,h3,p,li,dt,dd,address'
        ));
      }

      const items = [];
      const seen = new Set();
      for (const element of containers) {
        if (items.length >= 36 || isExcluded(element)) continue;
        const style = getComputedStyle(element);
        if (style.display === 'none' || style.visibility === 'hidden') continue;
        const walker = document.createTreeWalker(
          element,
          NodeFilter.SHOW_TEXT
        );
        let node;
        while ((node = walker.nextNode()) && items.length < 36) {
          const raw = node.nodeValue || '';
          for (const match of raw.matchAll(/[^.!?]+(?:[.!?]+|$)/g)) {
            const leading = match[0].search(/\\S/);
            const text = match[0].replace(/\\s+/g, ' ').trim();
            if (leading < 0 || text.length < 2 || text.length > 420) continue;
            const key = text.toLowerCase();
            if (seen.has(key) || recommendationPattern.test(text)) continue;
            const start = (match.index || 0) + leading;
            const end = Math.min(start + match[0].trim().length, raw.length);
            if (end <= start) continue;
            const range = document.createRange();
            range.setStart(node, start);
            range.setEnd(node, end);
            if (!Array.from(range.getClientRects()).some(
              rect => rect.width > 1 && rect.height > 1
            )) continue;
            seen.add(key);
            items.push({ element, range, text });
          }
        }
      }

      const overlay = document.createElement('div');
      overlay.id = 'homeboard-highlight-layer';
      Object.assign(overlay.style, {
        position: 'fixed',
        inset: '0',
        pointerEvents: 'none',
        zIndex: '2147483646'
      });

      const tag = document.createElement('div');
      tag.id = 'homeboard-scan-tag';
      tag.textContent = 'HOMEBOARD · Finding details';
      Object.assign(tag.style, {
        position: 'fixed',
        top: '12px',
        left: '12px',
        maxWidth: 'calc(100vw - 24px)',
        padding: '8px 11px',
        borderRadius: '999px',
        background: 'rgba(61, 80, 74, 0.96)',
        border: '1px solid rgba(249, 226, 205, 0.68)',
        boxShadow: '0 8px 24px rgba(36, 49, 41, 0.28)',
        color: '#FFF3E5',
        font: '800 12px -apple-system, BlinkMacSystemFont, sans-serif',
        letterSpacing: '0.035em',
        pointerEvents: 'none',
        zIndex: '2147483647'
      });
      document.documentElement.append(overlay, tag);

      window.__homeboardSentenceScan = {
        items,
        overlay,
        tag,
        cleanup() {
          overlay.remove();
          tag.remove();
          delete window.__homeboardSentenceScan;
        }
      };
      return items.length;
    })();
    """

    return await withCheckedContinuation { continuation in
      webView.evaluateJavaScript(script) { value, _ in
        continuation.resume(returning: (value as? NSNumber)?.intValue ?? 0)
      }
    }
  }

  @MainActor
  private func highlightPageSentence(at index: Int) async -> [String: Any] {
    let script = """
    const scan = window.__homeboardSentenceScan;
    const item = scan?.items?.[Number(currentIndex)];
    if (!scan || !item || !item.element?.isConnected) {
      return {};
    }

    item.element.scrollIntoView({
      behavior: 'smooth',
      block: 'center',
      inline: 'nearest'
    });
    await new Promise(resolve => setTimeout(resolve, 190));
    scan.overlay.replaceChildren();

    let rects = [];
    try {
      rects = Array.from(item.range.getClientRects());
    } catch (_) {}
    if (!rects.length) rects = [item.element.getBoundingClientRect()];
    for (const rect of rects) {
      if (
        rect.width < 1 || rect.height < 1
        || rect.bottom < 0 || rect.top > innerHeight
      ) continue;
      const highlight = document.createElement('div');
      Object.assign(highlight.style, {
        position: 'fixed',
        left: `${Math.max(rect.left - 2, 0)}px`,
        top: `${Math.max(rect.top - 1, 0)}px`,
        width: `${Math.min(rect.width + 4, innerWidth)}px`,
        height: `${rect.height + 2}px`,
        borderRadius: '4px',
        background: 'rgba(249, 226, 205, 0.52)',
        boxShadow: '0 0 0 1px rgba(61, 80, 74, 0.68)',
        opacity: '0',
        transition: 'opacity 110ms ease-out'
      });
      scan.overlay.append(highlight);
      requestAnimationFrame(() => { highlight.style.opacity = '1'; });
    }
    scan.tag.textContent =
      `HOMEBOARD · Reading ${Number(currentIndex) + 1} / ${scan.items.length}`;
    return {
      text: item.text,
      current: Number(currentIndex) + 1,
      total: scan.items.length
    };
    """

    do {
      let value = try await webView.callAsyncJavaScript(
        script,
        arguments: ["currentIndex": index],
        in: nil,
        contentWorld: .page
      )
      return stringDictionary(value) ?? [:]
    } catch {
      return [:]
    }
  }

  @MainActor
  private func finishPageHighlight(status: String) async {
    let script = """
    (() => {
      const scan = window.__homeboardSentenceScan;
      if (!scan?.tag) return false;
      scan.overlay?.replaceChildren();
      scan.tag.textContent = `HOMEBOARD · ${finalStatus}`;
      return true;
    })();
    """
    _ = try? await webView.callAsyncJavaScript(
        script,
        arguments: ["finalStatus": status],
        in: nil,
        contentWorld: .page
      )
  }

  private func applyAnalysisFacts(_ analysis: HomeboardListingAnalysis) {
    let facts = analysis.facts
    extractedValues["address"] = facts.address
    extractedValues["unit"] = facts.unit
    extractedValues["city"] = facts.city
    extractedValues["neighborhood"] = facts.neighborhood
    extractedValues["price"] = facts.price
    extractedValues["bedrooms"] = facts.bedrooms
    extractedValues["bathrooms"] = facts.bathrooms
    extractedValues["squareFeet"] = facts.squareFeet
    extractedValues["imageURL"] = facts.imageURL
    extractedValues["summary"] = facts.summary
    extractedValues["amenities"] = facts.amenities
    extractedValues["modelInsights"] = facts.insights.map {
      [
        "category": $0.category,
        "label": $0.label,
        "sentiment": $0.sentiment,
        "confidence": $0.confidence,
        "evidence": $0.evidence
      ] as [String: Any]
    }
    extractedValues["listingScope"] = analysis.scope
    extractedValues["extractionConfidence"] = "needs-review"
  }

  @MainActor
  private func captureVisibleViewport(
    force: Bool,
    role: ScanEvidenceRole,
    updatesProgress: Bool,
    usesOCR: Bool = true
  ) async {
    guard !isScanning else { return }
    let offsetBucket = Int((webView.scrollView.contentOffset.y / 140).rounded())
    guard force || !scannedOffsets.contains(offsetBucket) else {
      if updatesProgress {
        progressLabel.text = progressText()
      }
      return
    }

    isScanning = true
    scannedOffsets.insert(offsetBucket)
    moreButton.isEnabled = false
    if updatesProgress {
      progressLabel.text = "Scanning this section…"
    }
    let browserResult = await collectBrowserEvidence()
    let recognizedText: String
    if usesOCR {
      recognizedText = await recognizeText(in: await snapshotVisiblePage())
    } else {
      recognizedText = ""
    }

    isScanning = false
    moreButton.isEnabled = !isQuickScanning
    scanCount += 1

    absorbBrowserMetadata(browserResult)
    let captureIsRecommendation = browserResult["captureIsRecommendation"] as? Bool ?? false
    let combinedEvidence = [
      browserResult["visibleText"] as? String,
      captureIsRecommendation ? nil : recognizedText
    ]
      .compactMap { $0 }
      .joined(separator: "\n")
    absorbEvidence(combinedEvidence, role: role)

    if updatesProgress {
      progressLabel.text = progressText()
    }
    reviewButton.isEnabled = !isQuickScanning
    reviewButton.alpha = isQuickScanning ? 0.45 : 1
  }

  @MainActor
  private func snapshotVisiblePage() async -> UIImage? {
    let configuration = WKSnapshotConfiguration()
    configuration.rect = scannerFrame.frame.intersection(webView.bounds)
    return await withCheckedContinuation { continuation in
      webView.takeSnapshot(with: configuration) { image, _ in
        continuation.resume(returning: image)
      }
    }
  }

  @MainActor
  private func moveWebView(to offset: CGFloat) async {
    await withCheckedContinuation { continuation in
      UIView.animate(
        withDuration: 0.10,
        delay: 0,
        options: [.curveEaseInOut, .allowUserInteraction]
      ) {
        self.webView.scrollView.contentOffset = CGPoint(x: 0, y: offset)
      } completion: { _ in
        continuation.resume()
      }
    }
    try? await Task.sleep(for: .milliseconds(55))
  }

  private func absorbBrowserMetadata(_ browserResult: [String: Any]) {
    if let title = browserResult["pageTitle"] as? String {
      extractedValues["pageTitle"] = title
    }
    if let canonicalURL = browserResult["canonicalURL"] as? String {
      extractedValues["canonicalURL"] = canonicalURL
    }
    if let imageURL = browserResult["imageURL"] as? String {
      extractedValues["imageURL"] = imageURL
    }
    if let latitude = (browserResult["latitude"] as? NSNumber)?.doubleValue,
       (-90...90).contains(latitude) {
      extractedValues["latitude"] = latitude
    }
    if let longitude = (browserResult["longitude"] as? NSNumber)?.doubleValue,
       (-180...180).contains(longitude) {
      extractedValues["longitude"] = longitude
    }
    if let sharedPageEvidence = browserResult["sharedPageEvidence"] as? String {
      absorbSharedPageEvidence(sharedPageEvidence)
    }
    if let primaryFactEvidence = browserResult["primaryFactEvidence"] as? String {
      absorbPrimaryFactEvidence(primaryFactEvidence)
    }
    if let candidates = browserResult["addressCandidates"] as? [[String: Any]] {
      absorbAddressEvidence(candidates)
    }
  }

  private func clearAutomaticallyCapturedPrimaryFacts() {
    evidenceSegments.removeAll()
    primaryEvidenceSegments.removeAll()
    evidenceKeys.removeAll()
    extractedValues.removeValue(forKey: "semanticPageEvidence")
    extractedValues.removeValue(forKey: "primaryFactEvidence")
    for key in [
      "unit",
      "price",
      "bedrooms",
      "bathrooms",
      "squareFeet",
      "neighborhood"
    ] where !manuallyCorrectedFields.contains(key) {
      extractedValues.removeValue(forKey: key)
    }
    if !addressWasManuallyCorrected {
      addressEvidence.removeAll {
        ["visible", "ocr", "captured"].contains($0.source.lowercased())
      }
      extractedValues.removeValue(forKey: "address")
      extractedValues["addressEvidence"] = addressEvidence.map {
        ["text": $0.text, "source": $0.source]
      }
      if let address = HomeboardListingIntelligence.bestStreetAddress(from: addressEvidence) {
        extractedValues["address"] = address
      }
    }
  }

  private func updateQuickScanControls(isRunning: Bool) {
    quickScanButton.configuration?.title = isRunning
      ? "Stop"
      : (safariPreprocessedValues == nil ? "Quick Scan" : "Scan again")
    quickScanButton.configuration?.image = UIImage(
      systemName: isRunning ? "stop.fill" : "viewfinder"
    )
    moreButton.isEnabled = !isRunning
    reviewButton.isEnabled = !isRunning && scanCount > 0
    quickScanButton.isEnabled = pageFinishedLoading
  }

  @MainActor
  private func collectBrowserEvidence(
    wholePage: Bool = false
  ) async -> [String: Any] {
    let bounds = webView.bounds
    let scanRect = scannerFrame.frame.intersection(bounds)
    let width = max(bounds.width, 1)
    let height = max(bounds.height, 1)
    let selectionLeft = Double(scanRect.minX / width)
    let selectionTop = Double(scanRect.minY / height)
    let selectionRight = Double(scanRect.maxX / width)
    let selectionBottom = Double(scanRect.maxY / height)
    let script = """
    (() => {
      const wholePage = \(wholePage ? "true" : "false");
      const seen = new Set();
      const values = [];
      const captureRect = {
        left: window.innerWidth * \(selectionLeft),
        top: window.innerHeight * \(selectionTop),
        right: window.innerWidth * \(selectionRight),
        bottom: window.innerHeight * \(selectionBottom)
      };
      const recommendationPattern =
        /similar homes|similar listings|similar results|recommended|you may also like|homes you may like|nearby homes|nearby rentals|other rentals|other available homes|more homes|homes for you/i;
      const recommendationRoots = new Set(Array.from(document.querySelectorAll(
        '[data-testid*="recommend" i],[data-testid*="similar" i],'
        + '[data-testid*="nearby" i],[aria-label*="recommend" i],'
        + '[aria-label*="similar" i],[aria-label*="nearby" i]'
      )));
      for (const heading of document.querySelectorAll('h2,h3,h4,[role="heading"]')) {
        const headingText = (heading.innerText || heading.textContent || '').trim();
        if (!recommendationPattern.test(headingText)) continue;
        const semanticRoot = heading.closest('section,aside,[role="region"]');
        const fallbackRoot = heading.parentElement && heading.parentElement.children.length <= 16
          ? heading.parentElement
          : null;
        const root = semanticRoot || fallbackRoot;
        if (root) recommendationRoots.add(root);
      }
      const isRecommendation = node => {
        for (const root of recommendationRoots) {
          if (root === node || root.contains(node)) return true;
        }
        return false;
      };
      const primaryFactValues = [];
      const primaryFactSeen = new Set();
      const isListingCard = node => Boolean(node.closest(
        '[data-testid*="property-card" i],[data-testid*="listing-card" i],'
        + '[class*="property-card" i],[class*="listing-card" i],'
        + '[class*="recommend" i],[class*="similar" i]'
      ));
      const addPrimaryFact = value => {
        const text = String(value || '').replace(/\\s+/g, ' ').trim();
        if (!text || text.length > 320 || primaryFactSeen.has(text.toLowerCase())) return;
        primaryFactSeen.add(text.toLowerCase());
        primaryFactValues.push(text);
      };
      const normalizedFactText = node => {
        const descriptor = [
          node.getAttribute('data-testid'),
          node.getAttribute('itemprop'),
          node.getAttribute('aria-label')
        ].filter(Boolean).join(' ');
        const raw = (
          node.getAttribute('content')
          || node.getAttribute('aria-label')
          || node.innerText
          || node.textContent
          || ''
        ).replace(/\\s+/g, ' ').trim();
        if (!raw) return '';
        if (/price|rent/i.test(descriptor) && /^\\$?\\s*[1-9][\\d,]*(?:\\.\\d{2})?$/.test(raw)) {
          return `Monthly rent ${raw.startsWith('$') ? raw : '$' + raw}`;
        }
        if (/bath/i.test(descriptor) && /^\\d+(?:\\.\\d+)?$/.test(raw)) {
          return `${raw} bathrooms`;
        }
        return raw;
      };
      for (const node of document.querySelectorAll(
        '[data-testid="price"],[data-testid*="monthly-rent" i],'
        + '[data-testid*="base-rent" i],[data-testid*="bed-bath" i],'
        + '[data-testid*="bathroom" i],[itemprop="price"],'
        + '[itemprop="numberOfBathroomsTotal"],[itemprop="numberOfBathrooms"],'
        + '[aria-label*="monthly rent" i],[aria-label*="base rent" i],'
        + '[aria-label*="bathroom" i]'
      )) {
        if (isRecommendation(node) || isListingCard(node)) continue;
        addPrimaryFact(normalizedFactText(node));
      }
      for (const label of document.querySelectorAll('dt,th,label,span,div,p')) {
        if (isRecommendation(label) || isListingCard(label)) continue;
        const labelText = (label.innerText || label.textContent || '')
          .replace(/\\s+/g, ' ')
          .trim();
        if (!/^(?:monthly rent|base rent|rent|bathrooms?|baths?)[:：]?$/i.test(labelText)) {
          continue;
        }
        const row = label.closest('tr,dl,li,[role="row"]') || label.parentElement;
        const rowText = (row && (row.innerText || row.textContent) || '')
          .replace(/\\s+/g, ' ')
          .trim();
        if (rowText.length <= 320) addPrimaryFact(rowText);
      }
      const nodes = Array.from(document.querySelectorAll(
        'h1,h2,h3,h4,p,li,dt,dd,span,a,button,[aria-label],[data-testid]'
      ));
      for (const node of nodes) {
        if (isRecommendation(node)) continue;
        const rect = node.getBoundingClientRect();
        if (
          (!wholePage && (
            rect.right < captureRect.left
            || rect.left > captureRect.right
            || rect.bottom < captureRect.top
            || rect.top > captureRect.bottom
          ))
          || rect.width < 2
          || rect.height < 2
        ) {
          continue;
        }
        const text = (node.innerText || node.textContent || node.getAttribute('aria-label') || '')
          .replace(/\\s+/g, ' ')
          .trim();
        if (
          !text
          || text.length > 420
          || seen.has(text)
          || recommendationPattern.test(text)
        ) continue;
        seen.add(text);
        values.push(text);
        if (values.length >= (wholePage ? 700 : 150)) break;
      }
      const meta = (property, name) => {
        const node = document.querySelector(
          `meta[property="${property}"],meta[name="${name || property}"]`
        );
        return node ? node.content : null;
      };
      const canonical = document.querySelector('link[rel="canonical"]');
      const addressCandidates = [];
      const coordinateCandidates = [];
      const coordinateNumber = (value) => {
        if (typeof value === 'number' && Number.isFinite(value)) return value;
        if (typeof value !== 'string') return null;
        const parsed = Number(value.trim());
        return Number.isFinite(parsed) ? parsed : null;
      };
      const addCoordinateCandidate = (value, source) => {
        if (!value || typeof value !== 'object') return;
        const containers = [
          value,
          value.geo,
          value.location,
          value.location && value.location.geo,
          value.address && value.address.geo
        ];
        for (const candidate of containers) {
          if (!candidate || typeof candidate !== 'object') continue;
          const latitude = coordinateNumber(candidate.latitude ?? candidate.lat);
          const longitude = coordinateNumber(
            candidate.longitude ?? candidate.lng ?? candidate.lon
          );
          if (
            latitude === null
            || longitude === null
            || latitude < -90
            || latitude > 90
            || longitude < -180
            || longitude > 180
            || (latitude === 0 && longitude === 0)
          ) continue;
          const score =
            (value.address || value.streetAddress ? 5 : 0)
            + (value.offers || value.price || value.rent ? 3 : 0)
            + (value.zpid || value.listingId || value.propertyId ? 5 : 0)
            + (value.numberOfBedrooms || value.bedrooms ? 2 : 0)
            + (() => {
              const rawURL = value.url
                || value['@id']
                || (typeof value.mainEntityOfPage === 'string'
                  ? value.mainEntityOfPage
                  : value.mainEntityOfPage && value.mainEntityOfPage['@id']);
              if (typeof rawURL !== 'string') return 0;
              try {
                const candidatePath = new URL(rawURL, location.href).pathname.replace(/\\/+$/, '');
                const pagePath = new URL(
                  canonical ? canonical.href : location.href,
                  location.href
                ).pathname.replace(/\\/+$/, '');
                return candidatePath === pagePath ? 12 : 0;
              } catch (_) {
                return 0;
              }
            })();
          coordinateCandidates.push({ latitude, longitude, source, score });
          return;
        }
      };
      const addAddressCandidate = (text, source) => {
        const value = String(text || '').replace(/\\s+/g, ' ').trim();
        if (!value || value.length > 320) return;
        if (addressCandidates.some(candidate =>
          candidate.text.toLowerCase() === value.toLowerCase()
          && candidate.source === source
        )) return;
        addressCandidates.push({ text: value, source });
      };
      const walkStructuredData = (value, depth = 0) => {
        if (!value || depth > 7) return;
        if (Array.isArray(value)) {
          value.forEach(item => walkStructuredData(item, depth + 1));
          return;
        }
        if (typeof value !== 'object') return;
        const type = Array.isArray(value['@type'])
          ? value['@type'].join(' ')
          : String(value['@type'] || '');
        if (/ItemList/i.test(type)) return;
        addCoordinateCandidate(value, 'jsonld');
        const offer = value.offers && typeof value.offers === 'object'
          ? (Array.isArray(value.offers) ? value.offers[0] : value.offers)
          : null;
        const structuredPrice = offer && (offer.price || offer.lowPrice)
          || value.price
          || value.monthlyRent;
        if (structuredPrice && /^\\$?\\s*[1-9][\\d,]*(?:\\.\\d{2})?$/.test(String(structuredPrice))) {
          const priceText = String(structuredPrice).trim();
          addPrimaryFact(`Monthly rent ${priceText.startsWith('$') ? priceText : '$' + priceText}`);
        }
        const structuredBathrooms =
          value.numberOfBathroomsTotal
          || value.numberOfBathrooms
          || value.bathrooms;
        if (structuredBathrooms && /^\\d+(?:\\.\\d+)?$/.test(String(structuredBathrooms))) {
          addPrimaryFact(`${structuredBathrooms} bathrooms`);
        }
        const structuredBedrooms =
          value.numberOfBedrooms
          || value.bedrooms;
        if (structuredBedrooms && /^\\d+(?:\\.\\d+)?$/.test(String(structuredBedrooms))) {
          addPrimaryFact(`${structuredBedrooms} bedrooms`);
        }
        const address = value.address;
        if (/PostalAddress/i.test(type) || (address && typeof address === 'object')) {
          const candidate = /PostalAddress/i.test(type) ? value : address;
          if (candidate && typeof candidate === 'object') {
            const cityState = [
              candidate.addressLocality,
              candidate.addressRegion
            ].filter(Boolean).join(', ')
              + (candidate.postalCode ? ` ${candidate.postalCode}` : '');
            addAddressCandidate(
              [candidate.streetAddress, cityState].filter(Boolean).join(', '),
              'jsonld'
            );
          } else if (typeof address === 'string') {
            addAddressCandidate(address, 'jsonld');
          }
        }
        Object.values(value).forEach(item => walkStructuredData(item, depth + 1));
      };
      for (const script of document.querySelectorAll('script[type="application/ld+json"]')) {
        try { walkStructuredData(JSON.parse(script.textContent || '')); } catch (_) {}
      }
      addCoordinateCandidate({
        latitude: meta('place:location:latitude'),
        longitude: meta('place:location:longitude')
      }, 'meta');
      coordinateCandidates.sort((left, right) => right.score - left.score);
      const coordinate = coordinateCandidates[0] || null;
      for (const property of [
        'place:location:street_address',
        'og:street-address',
        'twitter:data1'
      ]) {
        addAddressCandidate(meta(property), 'meta');
      }
      const exactAddressNodes = Array.from(document.querySelectorAll(
        'address,[itemprop="streetAddress"],[itemprop="address"],'
        + '[data-testid*="address" i],[aria-label*="address" i]'
      ));
      for (const node of exactAddressNodes) {
        if (isRecommendation(node)) continue;
        const text = (node.innerText || node.textContent || node.getAttribute('aria-label') || '')
          .replace(/\\s+/g, ' ')
          .trim();
        addAddressCandidate(text, node.matches('[itemprop]') ? 'itemprop' : 'addressNode');
        if (addressCandidates.length >= 24) break;
      }
      for (const heading of document.querySelectorAll('h1')) {
        addAddressCandidate(heading.innerText || heading.textContent, 'h1');
      }
      addAddressCandidate(meta('og:title'), 'title');
      addAddressCandidate(document.title, 'title');
      const canonicalAddress = (canonical ? canonical.href : location.href)
        .split('/')
        .map(part => {
          try { return decodeURIComponent(part).replace(/[-_]+/g, ' '); }
          catch (_) { return part.replace(/[-_]+/g, ' '); }
        })
        .find(part => /^\\d{1,6}(?:-\\d{1,6})?\\s+/.test(part));
      addAddressCandidate(canonicalAddress, 'canonical');
      const sharedValues = [
        document.title || meta('og:title'),
        ...addressCandidates.slice(0, 18).map(candidate => candidate.text)
      ];
      if (addressCandidates.length > 30) {
        addressCandidates.length = 30;
      }
      const captureIsRecommendation = !wholePage && Array.from(recommendationRoots).some(root => {
        const rect = root.getBoundingClientRect();
        return !(
          rect.right < captureRect.left
          || rect.left > captureRect.right
          || rect.bottom < captureRect.top
          || rect.top > captureRect.bottom
        );
      });
      return {
        visibleText: values.join('\\n').slice(0, wholePage ? 32000 : 12000),
        sharedPageEvidence: sharedValues.filter(Boolean).join('\\n'),
        primaryFactEvidence: primaryFactValues.join('\\n').slice(0, 4000),
        addressCandidates,
        captureIsRecommendation,
        pageTitle: document.title || meta('og:title'),
        canonicalURL: canonical ? canonical.href : location.href,
        imageURL: meta('og:image'),
        latitude: coordinate ? coordinate.latitude : null,
        longitude: coordinate ? coordinate.longitude : null
      };
    })();
    """

    return await withCheckedContinuation { continuation in
      webView.evaluateJavaScript(script) { value, _ in
        continuation.resume(returning: value as? [String: Any] ?? [:])
      }
    }
  }

  private func recognizeText(in image: UIImage?) async -> String {
    guard let image, let cgImage = image.cgImage else { return "" }
    return await withCheckedContinuation { continuation in
      let request = VNRecognizeTextRequest { request, error in
        guard error == nil else {
          continuation.resume(returning: "")
          return
        }
        let text = (request.results as? [VNRecognizedTextObservation])?
          .compactMap { $0.topCandidates(1).first?.string }
          .joined(separator: "\n") ?? ""
        continuation.resume(returning: text)
      }
      request.recognitionLevel = .accurate
      request.usesLanguageCorrection = true
      request.recognitionLanguages = ["en-US"]

      DispatchQueue.global(qos: .userInitiated).async {
        let handler = VNImageRequestHandler(cgImage: cgImage, orientation: .up)
        do {
          try handler.perform([request])
        } catch {
          continuation.resume(returning: "")
        }
      }
    }
  }

  private func absorbEvidence(
    _ text: String?,
    role: ScanEvidenceRole
  ) {
    guard let text else { return }
    let cleaned = text
      .replacingOccurrences(of: #"[ \t]+"#, with: " ", options: .regularExpression)
      .replacingOccurrences(of: #"\n{3,}"#, with: "\n\n", options: .regularExpression)
      .trimmingCharacters(in: .whitespacesAndNewlines)
    guard !cleaned.isEmpty else { return }

    let roleKey = role == .primary ? "primary" : "supporting"
    let key = "\(roleKey)|\(String(cleaned.prefix(240)).lowercased())"
    guard evidenceKeys.insert(key).inserted else { return }
    let segment = "[\(roleKey.uppercased())]\n\(String(cleaned.prefix(1_100)))"
    evidenceSegments.append(segment)
    if evidenceSegments.count > 28 {
      evidenceSegments.removeFirst(evidenceSegments.count - 28)
    }
    if role == .primary {
      primaryEvidenceSegments.append(String(cleaned.prefix(1_100)))
      if primaryEvidenceSegments.count > 8 {
        primaryEvidenceSegments.removeFirst(primaryEvidenceSegments.count - 8)
      }
      parseFacts(from: cleaned)
    } else {
      mergeAmenities(detectedAmenities(in: cleaned))
    }
  }

  private func absorbSharedPageEvidence(_ text: String) {
    let cleaned = text
      .replacingOccurrences(of: #"[ \t]+"#, with: " ", options: .regularExpression)
      .replacingOccurrences(of: #"\n{3,}"#, with: "\n\n", options: .regularExpression)
      .trimmingCharacters(in: .whitespacesAndNewlines)
    guard !cleaned.isEmpty else { return }

    let existing = string("sharedPageEvidence") ?? ""
    let merged = existing.isEmpty ? cleaned : "\(existing)\n\(cleaned)"
    extractedValues["sharedPageEvidence"] = String(merged.prefix(2_400))
    recordAddressEvidence(text: cleaned, source: "metadata")
  }

  private func absorbPrimaryFactEvidence(_ text: String) {
    let cleaned = text
      .replacingOccurrences(of: #"[ \t]+"#, with: " ", options: .regularExpression)
      .replacingOccurrences(of: #"\n{3,}"#, with: "\n\n", options: .regularExpression)
      .trimmingCharacters(in: .whitespacesAndNewlines)
    guard !cleaned.isEmpty else { return }

    let existing = string("primaryFactEvidence") ?? ""
    let lines = (existing + "\n" + cleaned)
      .split(separator: "\n")
      .map(String.init)
    var seen = Set<String>()
    let unique = lines.filter { seen.insert($0.lowercased()).inserted }
    let merged = String(unique.joined(separator: "\n").prefix(4_000))
    extractedValues["primaryFactEvidence"] = merged
    parseFacts(from: merged)
  }

  private func absorbAddressEvidence(_ candidates: [[String: Any]]) {
    for candidate in candidates {
      guard
        let text = candidate["text"] as? String,
        let source = candidate["source"] as? String
      else {
        continue
      }
      recordAddressEvidence(text: text, source: source)
    }
  }

  private func recordAddressEvidence(text: String, source: String) {
    let cleaned = text
      .replacingOccurrences(of: #"\s+"#, with: " ", options: .regularExpression)
      .trimmingCharacters(in: .whitespacesAndNewlines)
    guard !cleaned.isEmpty else { return }

    let candidate = HomeboardAddressEvidence(text: cleaned, source: source)
    guard !addressEvidence.contains(candidate) else { return }
    addressEvidence.append(candidate)
    if addressEvidence.count > 42 {
      addressEvidence.removeFirst(addressEvidence.count - 42)
    }
    extractedValues["addressEvidence"] = addressEvidence.map {
      ["text": $0.text, "source": $0.source]
    }
    if !addressWasManuallyCorrected,
       let address = HomeboardListingIntelligence.bestStreetAddress(from: addressEvidence)
    {
      extractedValues["address"] = address
    }
  }

  private func parseFacts(from text: String) {
    let flattened = text.replacingOccurrences(
      of: #"\s+"#,
      with: " ",
      options: .regularExpression
    )

    recordAddressEvidence(text: text, source: "visible")
    assignIfMissing(
      "unit",
      firstMatch(
        in: flattened,
        pattern: #"(?:\b(?:apt|apartment|unit)\s*|#\s*)((?=[A-Za-z0-9-]*\d)[A-Za-z0-9-]{1,16})\b"#
      )?.uppercased()
    )
    assignIfMissing(
      "price",
      firstMatch(
        in: flattened,
        pattern: #"\$\s*((?:[1-9][0-9]{0,2}(?:,[0-9]{3})+)|(?:[5-9][0-9]{2}|[1-9][0-9]{3,4}))(?:\.\d{2})?"#
      ).flatMap(numeric)
    )
    assignIfMissing(
      "bedrooms",
      flattened.range(
        of: #"\bstudio\b"#,
        options: [.regularExpression, .caseInsensitive]
      ) != nil
        ? 0
        : firstMatch(
          in: flattened,
          pattern: #"\b(\d+(?:\.\d+)?)\s*(?:bd|bed|beds|bedroom|bedrooms)\b"#
        ).flatMap(numeric)
    )
    let bathroomMatches = [
      firstMatch(
        in: flattened,
        pattern: #"\b(\d+(?:\.\d+)?)\s*(?:full\s+|half\s+)?(?:ba|bath|baths|bathroom|bathrooms)\b"#
      ),
      firstMatch(
        in: flattened,
        pattern: #"\b(?:ba|bath|baths|bathroom|bathrooms)\s*[:\-]?\s*(\d+(?:\.\d+)?)\b"#
      )
    ]
    assignIfMissing(
      "bathrooms",
      bathroomMatches.compactMap { $0 }.first.flatMap(numeric)
    )
    assignIfMissing(
      "squareFeet",
      firstMatch(
        in: flattened,
        pattern: #"\b([1-9][0-9]{2,4})\s*(?:sq\.?\s*ft|square\s+feet)\b"#
      ).flatMap(numeric)
    )
    assignIfMissing(
      "neighborhood",
      firstMatch(
        in: flattened,
        pattern: #"\b(?:Neighborhood|Area)\s*[:\-]\s*([A-Za-z][A-Za-z .'-]{2,44})"#
      )
    )
    mergeAmenities(detectedAmenities(in: flattened))
  }

  private func detectedAmenities(in text: String) -> [String] {
    let rules: [(String, [String])] = [
      ("pet friendly", ["pet friendly", "pets allowed", "dogs allowed", "cats allowed"]),
      ("in-unit laundry", ["in-unit laundry", "in unit laundry", "washer/dryer in unit", "washer and dryer in unit"]),
      ("free laundry", ["free laundry", "laundry included at no cost", "no-cost laundry"]),
      ("laundry in building", ["laundry in building", "on-site laundry", "onsite laundry", "shared laundry"]),
      ("dishwasher", ["dishwasher"]),
      ("elevator", ["elevator"]),
      ("doorman", ["doorman", "door attendant"]),
      ("parking", ["parking included", "garage parking", "off-street parking", "assigned parking"]),
      ("gym", ["fitness center", "fitness room", "on-site gym", "onsite gym", "gym"]),
      ("air conditioning", ["air conditioning", "central air", "central a/c"]),
      ("utilities included", ["utilities included", "heat included", "water included"]),
      ("no broker fee", ["no broker fee", "no-fee", "no fee apartment"]),
      ("outdoor space", ["private outdoor space", "balcony", "terrace", "patio", "backyard"]),
      ("natural light", ["natural light", "sun-filled", "sun drenched", "sun-drenched"]),
      ("storage", ["storage included", "storage space", "bike storage"]),
      ("furnished", ["fully furnished", "furnished apartment"]),
      ("rooftop", ["roof deck", "rooftop terrace", "rooftop access"])
    ]
    let negations: [String: [String]] = [
      "pet friendly": ["no pets", "pets not allowed", "pet-free building"],
      "in-unit laundry": ["no in-unit laundry", "no washer/dryer in unit"],
      "free laundry": ["paid laundry", "coin-operated laundry", "laundry for a fee"],
      "laundry in building": ["no laundry", "laundry off site", "laundry off-site"],
      "dishwasher": ["no dishwasher", "dishwasher not included"],
      "elevator": ["no elevator", "walk-up building"],
      "doorman": ["no doorman"],
      "parking": ["no parking", "parking not included"],
      "gym": ["no gym", "no fitness center"],
      "air conditioning": ["no air conditioning", "no a/c"],
      "utilities included": ["utilities not included", "utilities excluded"],
      "no broker fee": ["broker fee applies", "broker fee required"],
      "outdoor space": ["no outdoor space"],
      "furnished": ["unfurnished"],
      "rooftop": ["no rooftop access"]
    ]
    let haystack = text.lowercased()
    return rules.compactMap { label, phrases in
      guard phrases.contains(where: { haystack.contains($0) }) else { return nil }
      let isNegated = (negations[label] ?? []).contains(where: { haystack.contains($0) })
      return isNegated ? nil : label
    }
  }

  private func mergeAmenities(_ additions: [String]) {
    var seen = Set<String>()
    let existing = stringArray("amenities")
    let merged: [String] = (existing + additions).compactMap { value -> String? in
      let cleaned = value.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
      guard !cleaned.isEmpty, seen.insert(cleaned).inserted else { return nil }
      return cleaned
    }
    extractedValues["amenities"] = merged
  }

  private func progressText() -> String {
    let captured = [
      (string("address") != nil, "address"),
      (number("price") != nil, "rent"),
      (number("bedrooms") != nil, "beds"),
      (number("bathrooms") != nil, "baths")
    ].compactMap { $0.0 ? $0.1 : nil }
    let missing = [
      (string("address") == nil, "address"),
      (number("price") == nil, "rent"),
      (number("bedrooms") == nil, "beds"),
      (number("bathrooms") == nil, "baths")
    ].compactMap { $0.0 ? $0.1 : nil }
    let amenities = stringArray("amenities")

    if captured.isEmpty, scanCount == 0 {
      return "Scroll to useful details, then pause."
    }

    var message = "Captured \(naturalList(captured))."
    if !amenities.isEmpty {
      message += " Found \(naturalList(Array(amenities.prefix(2))))."
    } else if !missing.isEmpty {
      message += " Keep scrolling for \(naturalList(missing))."
    } else {
      message += " Review now, or keep scrolling for benefits and unit options."
    }
    return message
  }

  private func naturalList(_ values: [String]) -> String {
    switch values.count {
    case 0:
      return "details"
    case 1:
      return values[0]
    case 2:
      return "\(values[0]) and \(values[1])"
    default:
      return values.dropLast().joined(separator: ", ") + ", and " + (values.last ?? "")
    }
  }

  @objc private func reviewDetails() {
    guard let sharedURL else { return }
    if let completedSafariAnalysis {
      presentReview(analysis: completedSafariAnalysis, url: sharedURL)
      return
    }
    reviewButton.isEnabled = false
    moreButton.isEnabled = false
    progressLabel.text = "Organizing the details you scanned…"

    extractedValues["pageEvidence"] = evidenceSegments.joined(separator: "\n\n---\n\n")
    extractedValues["primaryPageEvidence"] = primaryEvidenceSegments.joined(
      separator: "\n\n"
    )
    extractedValues["listingScope"] = string("unit") == nil ? "unknown" : "unit"

    Task { [weak self] in
      guard let self else { return }
      let analysis = await HomeboardListingIntelligence.analyze(message: self.extractedValues)
      await MainActor.run {
        self.reviewButton.isEnabled = true
        self.moreButton.isEnabled = true
        self.progressLabel.text = self.progressText()
        self.presentReview(analysis: analysis, url: sharedURL)
      }
    }
  }

  private func presentReview(analysis: HomeboardListingAnalysis, url: URL) {
    var reviewValues = extractedValues
    if !analysis.options.isEmpty {
      ["unit", "price", "bedrooms", "bathrooms", "squareFeet", "availableDate"]
        .forEach { reviewValues.removeValue(forKey: $0) }
      reviewValues["listingScope"] = "building"
    }
    let review = ListingReviewViewController(
      analysis: analysis,
      initialValues: reviewValues,
      url: url,
      providerName: providerName(url.host),
      accentColor: accentColor,
      backgroundColor: backgroundColor,
      surfaceColor: surfaceColor
    )
    review.onSave = { [weak self] pendingImport in
      Task { [weak self] in
        do {
          try await HomeboardExtensionSyncClient.saveListing(pendingImport)
        } catch {
          HomeboardSharedImportStore.save(pendingImport)
        }
        await MainActor.run {
          self?.completeShareRequest()
        }
      }
    }
    review.onRescan = { [weak self] in
      self?.dismiss(animated: true)
    }
    review.modalPresentationStyle = .pageSheet
    if let sheet = review.sheetPresentationController {
      sheet.detents = [.large()]
      sheet.prefersGrabberVisible = true
      sheet.preferredCornerRadius = 22
    }
    present(review, animated: true)
  }

  private func showShareInputFailure() {
    guard !hasConfiguredLayout else {
      showFailure("Homeboard could not read this shared page.")
      return
    }
    hasConfiguredLayout = true
    view.backgroundColor = backgroundColor
    preferredContentSize = CGSize(width: 0, height: 260)

    let brand = UILabel()
    brand.text = "HOMEBOARD"
    brand.textColor = accentColor
    brand.font = .systemFont(ofSize: 12, weight: .heavy)

    let title = UILabel()
    title.text = "Safari did not include the listing page"
    title.textColor = HomeboardSharePalette.primaryText
    title.font = .systemFont(ofSize: 22, weight: .bold)
    title.numberOfLines = 0

    let explanation = UILabel()
    explanation.text =
      "Close this and use Safari’s square-with-up-arrow button in the browser toolbar. "
      + "A website’s own Share button can send only a preview instead of the open page."
    explanation.textColor = HomeboardSharePalette.secondaryText.withAlphaComponent(0.86)
    explanation.font = .systemFont(ofSize: 15, weight: .medium)
    explanation.numberOfLines = 0

    let closeButton = UIButton(type: .system)
    closeButton.configuration = .filled()
    closeButton.configuration?.title = "Back to Safari"
    closeButton.configuration?.baseBackgroundColor = accentColor
    closeButton.configuration?.baseForegroundColor = backgroundColor
    closeButton.addTarget(self, action: #selector(cancel), for: .touchUpInside)

    let stack = UIStackView(arrangedSubviews: [brand, title, explanation, closeButton])
    stack.axis = .vertical
    stack.spacing = 12
    stack.translatesAutoresizingMaskIntoConstraints = false
    view.addSubview(stack)
    NSLayoutConstraint.activate([
      stack.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 20),
      stack.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 24),
      stack.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -24),
      stack.bottomAnchor.constraint(
        lessThanOrEqualTo: view.safeAreaLayoutGuide.bottomAnchor,
        constant: -20
      ),
      closeButton.heightAnchor.constraint(equalToConstant: 48)
    ])
  }

  private func showFailure(_ message: String) {
    showInteractiveInterface()
    loadingView.stopAnimating()
    progressLabel.text = message
    moreButton.isEnabled = false
    quickScanButton.isEnabled = false
    reviewButton.isEnabled = false
    reviewButton.alpha = 0.45
  }

  private func showInteractiveInterface() {
    if !hasConfiguredLayout {
      configureLayout()
      hasConfiguredLayout = true
    }
    view.backgroundColor = backgroundColor
    preferredContentSize = CGSize(width: 0, height: 720)
  }

  private func scanSummary(_ facts: HomeboardListingFacts) -> String {
    var values: [String] = []
    if let address = facts.address { values.append(address) }
    if let price = facts.price {
      values.append("$\(Int(price.rounded()).formatted())")
    }
    if let bedrooms = facts.bedrooms {
      values.append("\(displayNumber(bedrooms)) bd")
    }
    if let bathrooms = facts.bathrooms {
      values.append("\(displayNumber(bathrooms)) ba")
    }
    return values.isEmpty
      ? "Review the listing details."
      : values.joined(separator: " · ")
  }

  private func displayNumber(_ value: Double) -> String {
    value.rounded() == value
      ? String(Int(value))
      : String(format: "%.1f", value)
  }

  private func completeShareRequest(
    finalizeArguments: [String: Any] = ["cleanup": true]
  ) {
    let propertyList = [
      NSExtensionJavaScriptFinalizeArgumentKey: finalizeArguments as NSDictionary
    ] as NSDictionary
    let provider = NSItemProvider(
      item: propertyList,
      typeIdentifier: UTType.propertyList.identifier
    )
    let item = NSExtensionItem()
    item.attachments = [provider]
    logger.notice(
      "Returning Safari finalize arguments: \(finalizeArguments.keys.sorted().joined(separator: ", "), privacy: .public)"
    )
    extensionContext?.completeRequest(
      returningItems: [item],
      completionHandler: { [weak self] expired in
        self?.logger.notice(
          "Safari finalize handoff completed; expired=\(expired, privacy: .public)"
        )
      }
    )
  }

  @objc private func cancel() {
    completeShareRequest()
  }

  private func assignIfMissing(_ key: String, _ value: Any?) {
    guard extractedValues[key] == nil, let value else { return }
    extractedValues[key] = value
  }

  private func string(_ key: String) -> String? {
    guard let value = extractedValues[key] as? String else { return nil }
    let result = value.trimmingCharacters(in: .whitespacesAndNewlines)
    return result.isEmpty ? nil : result
  }

  private func number(_ key: String) -> Double? {
    if let value = extractedValues[key] as? NSNumber { return value.doubleValue }
    if let value = extractedValues[key] as? String { return numeric(value) }
    return nil
  }

  private func firstMatch(in text: String, pattern: String) -> String? {
    guard
      let expression = try? NSRegularExpression(pattern: pattern, options: [.caseInsensitive]),
      let match = expression.firstMatch(
        in: text,
        range: NSRange(text.startIndex..<text.endIndex, in: text)
      ),
      match.numberOfRanges > 1,
      let range = Range(match.range(at: 1), in: text)
    else {
      return nil
    }
    let value = String(text[range]).trimmingCharacters(in: .whitespacesAndNewlines)
    return value.isEmpty ? nil : value
  }

  private func firstWebURL(in text: String) -> URL? {
    let range = NSRange(text.startIndex..<text.endIndex, in: text)
    let detector = try? NSDataDetector(types: NSTextCheckingResult.CheckingType.link.rawValue)
    return detector?
      .matches(in: text, options: [], range: range)
      .compactMap(\.url)
      .first(where: { ["http", "https"].contains($0.scheme?.lowercased() ?? "") })
  }

  private func cleanedTitle(_ value: String) -> String {
    value
      .replacingOccurrences(of: #"https?://\S+"#, with: "", options: .regularExpression)
      .trimmingCharacters(in: .whitespacesAndNewlines)
      .prefix(180)
      .description
  }

  private func numeric(_ input: String?) -> Double? {
    guard let input else { return nil }
    let raw = input.filter { $0.isNumber || $0 == "." }
    return raw.isEmpty ? nil : Double(raw)
  }

  private func stringArray(_ key: String) -> [String] {
    if let values = extractedValues[key] as? [String] {
      return values
    }
    return []
  }

  private func providerName(_ host: String?) -> String? {
    guard let host = host?.lowercased() else { return nil }
    let providers = [
      ("zillow.com", "Zillow"),
      ("streeteasy.com", "StreetEasy"),
      ("realtor.com", "Realtor"),
      ("apartments.com", "Apartments.com"),
      ("redfin.com", "Redfin"),
      ("rent.com", "Rent.com"),
      ("renthop.com", "RentHop")
    ]
    return providers.first(where: { host.hasSuffix($0.0) })?.1
      ?? host.replacingOccurrences(of: "www.", with: "")
  }
}

extension ShareViewController: WKNavigationDelegate {
  func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
    pageFinishedLoading = true
    loadingView.stopAnimating()
    providerLabel.text = providerName(webView.url?.host) ?? webView.title ?? "Shared listing"
    progressLabel.text = "Preparing the Homeboard page scan…"
    moreButton.isEnabled = true
    quickScanButton.isEnabled = true
    if safariPreprocessedValues != nil {
      quickScanTask = Task { [weak self] in
        await self?.runHighlightedPageScan()
      }
    } else {
      scheduleScan(force: true)
    }
  }

  func webView(
    _ webView: WKWebView,
    didFailProvisionalNavigation navigation: WKNavigation!,
    withError error: Error
  ) {
    logger.error("Shared page failed to load: \(error.localizedDescription, privacy: .public)")
    showFailure("This source would not open inside Homeboard.")
  }

  func webView(
    _ webView: WKWebView,
    didFail navigation: WKNavigation!,
    withError error: Error
  ) {
    logger.error("Shared page navigation failed: \(error.localizedDescription, privacy: .public)")
    showFailure("This source stopped loading before it could be scanned.")
  }
}

extension ShareViewController: UIScrollViewDelegate {
  func scrollViewWillBeginDragging(_ scrollView: UIScrollView) {
    guard !isQuickScanning else { return }
    scanWorkItem?.cancel()
    progressLabel.text = "Keep scrolling. Pause when useful details are visible."
  }

  func scrollViewDidScroll(_ scrollView: UIScrollView) {
    guard !isQuickScanning else { return }
    if scrollView.isDragging || scrollView.isDecelerating {
      scanWorkItem?.cancel()
    }
  }

  func scrollViewDidEndDragging(_ scrollView: UIScrollView, willDecelerate decelerate: Bool) {
    guard !isQuickScanning else { return }
    if !decelerate { scheduleScan() }
  }

  func scrollViewDidEndDecelerating(_ scrollView: UIScrollView) {
    guard !isQuickScanning else { return }
    scheduleScan()
  }

  func scrollViewDidEndScrollingAnimation(_ scrollView: UIScrollView) {
    guard !isQuickScanning else { return }
    scheduleScan()
  }
}

private final class ListingReviewViewController: UIViewController, UITextFieldDelegate {
  var onSave: ((HomeboardSharedImportStore.PendingImport) -> Void)?
  var onRescan: (() -> Void)?

  private let analysis: HomeboardListingAnalysis
  private var values: [String: Any]
  private let url: URL
  private let providerName: String?
  private let accentColor: UIColor
  private let backgroundColor: UIColor
  private let surfaceColor: UIColor

  private let scrollView = UIScrollView()
  private let stack = UIStackView()
  private let statusLabel = UILabel()
  private let saveButton = UIButton(type: .system)
  private let optionStack = UIStackView()
  private let detailsStack = UIStackView()
  private let addressField = UITextField()
  private let unitField = UITextField()
  private let neighborhoodField = UITextField()
  private let priceField = UITextField()
  private let bedroomsField = UITextField()
  private let bathroomsField = UITextField()

  init(
    analysis: HomeboardListingAnalysis,
    initialValues: [String: Any],
    url: URL,
    providerName: String?,
    accentColor: UIColor,
    backgroundColor: UIColor,
    surfaceColor: UIColor
  ) {
    self.analysis = analysis
    values = initialValues
    self.url = url
    self.providerName = providerName
    self.accentColor = accentColor
    self.backgroundColor = backgroundColor
    self.surfaceColor = surfaceColor
    super.init(nibName: nil, bundle: nil)
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) {
    fatalError("init(coder:) has not been implemented")
  }

  override func viewDidLoad() {
    super.viewDidLoad()
    view.backgroundColor = backgroundColor
    merge(analysis.facts)
    configureLayout()
    populateFields()
    renderOptions()
    updateSaveState()
  }

  private func configureLayout() {
    scrollView.translatesAutoresizingMaskIntoConstraints = false
    scrollView.keyboardDismissMode = .interactive
    view.addSubview(scrollView)

    stack.axis = .vertical
    stack.spacing = 13
    stack.translatesAutoresizingMaskIntoConstraints = false
    scrollView.addSubview(stack)

    let eyebrow = UILabel()
    eyebrow.text = "REVIEW SCANNED DETAILS"
    eyebrow.textColor = accentColor
    eyebrow.font = .systemFont(ofSize: 10, weight: .heavy)

    let title = UILabel()
    title.text = analysis.options.isEmpty ? "Confirm this rental" : "Choose the exact home"
    title.textColor = HomeboardSharePalette.primaryText
    title.font = .systemFont(ofSize: 25, weight: .bold)

    statusLabel.text = analysis.usedOnDeviceModel
      ? "On-device model assisted. \(analysis.message)"
      : analysis.message
    statusLabel.textColor = HomeboardSharePalette.secondaryText.withAlphaComponent(0.82)
    statusLabel.font = .systemFont(ofSize: 13)
    statusLabel.numberOfLines = 0

    optionStack.axis = .vertical
    optionStack.spacing = 8
    optionStack.isHidden = analysis.options.isEmpty
    detailsStack.axis = .vertical
    detailsStack.spacing = 13
    detailsStack.isHidden = !analysis.options.isEmpty

    configure(addressField, placeholder: "Exact street address", keyboard: .default)
    configure(unitField, placeholder: "Unit, if applicable", keyboard: .default)
    configure(neighborhoodField, placeholder: "Neighborhood", keyboard: .default)
    configure(priceField, placeholder: "Monthly rent", keyboard: .decimalPad)
    configure(bedroomsField, placeholder: "Beds", keyboard: .decimalPad)
    configure(bathroomsField, placeholder: "Baths", keyboard: .decimalPad)

    stack.addArrangedSubview(eyebrow)
    stack.addArrangedSubview(title)
    stack.addArrangedSubview(statusLabel)
    stack.addArrangedSubview(optionStack)
    if let amenitySummary = makeAmenitySummary() {
      detailsStack.addArrangedSubview(amenitySummary)
    }
    detailsStack.addArrangedSubview(fieldGroup("ADDRESS", addressField))
    detailsStack.addArrangedSubview(pair(
      fieldGroup("UNIT · OPTIONAL", unitField),
      fieldGroup("NEIGHBORHOOD", neighborhoodField)
    ))
    detailsStack.addArrangedSubview(pair(
      fieldGroup("MONTHLY RENT", priceField),
      fieldGroup("BEDROOMS", bedroomsField)
    ))
    detailsStack.addArrangedSubview(fieldGroup("BATHROOMS", bathroomsField))
    stack.addArrangedSubview(detailsStack)

    saveButton.setTitle("Save to active board", for: .normal)
    saveButton.setTitleColor(HomeboardSharePalette.buttonText, for: .normal)
    saveButton.titleLabel?.font = .systemFont(ofSize: 16, weight: .bold)
    saveButton.backgroundColor = accentColor
    saveButton.layer.cornerRadius = 15
    saveButton.heightAnchor.constraint(equalToConstant: 50).isActive = true
    saveButton.addTarget(self, action: #selector(save), for: .touchUpInside)

    let rescanButton = UIButton(type: .system)
    rescanButton.setTitle("Back to scanner", for: .normal)
    rescanButton.setTitleColor(HomeboardSharePalette.secondaryText, for: .normal)
    rescanButton.heightAnchor.constraint(equalToConstant: 42).isActive = true
    rescanButton.addTarget(self, action: #selector(rescan), for: .touchUpInside)

    stack.addArrangedSubview(saveButton)
    stack.addArrangedSubview(rescanButton)

    NSLayoutConstraint.activate([
      scrollView.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
      scrollView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
      scrollView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
      scrollView.bottomAnchor.constraint(equalTo: view.bottomAnchor),
      stack.topAnchor.constraint(equalTo: scrollView.contentLayoutGuide.topAnchor, constant: 18),
      stack.leadingAnchor.constraint(equalTo: scrollView.frameLayoutGuide.leadingAnchor, constant: 20),
      stack.trailingAnchor.constraint(equalTo: scrollView.frameLayoutGuide.trailingAnchor, constant: -20),
      stack.bottomAnchor.constraint(equalTo: scrollView.contentLayoutGuide.bottomAnchor, constant: -14)
    ])
  }

  private func configure(
    _ field: UITextField,
    placeholder: String,
    keyboard: UIKeyboardType
  ) {
    field.delegate = self
    field.placeholder = placeholder
    field.keyboardType = keyboard
    field.autocorrectionType = .no
    field.textColor = HomeboardSharePalette.primaryText
    field.tintColor = accentColor
    field.font = .systemFont(ofSize: 15)
    field.backgroundColor = surfaceColor
    field.layer.cornerRadius = 13
    field.layer.borderWidth = 1
    field.layer.borderColor = HomeboardSharePalette.border.withAlphaComponent(0.46).cgColor
    field.heightAnchor.constraint(equalToConstant: 46).isActive = true
    field.leftView = UIView(frame: CGRect(x: 0, y: 0, width: 12, height: 1))
    field.leftViewMode = .always
    field.rightView = UIView(frame: CGRect(x: 0, y: 0, width: 12, height: 1))
    field.rightViewMode = .always
    field.addTarget(self, action: #selector(fieldChanged), for: .editingChanged)
  }

  private func fieldGroup(_ title: String, _ field: UITextField) -> UIStackView {
    let label = UILabel()
    label.text = title
    label.textColor = HomeboardSharePalette.secondaryText.withAlphaComponent(0.76)
    label.font = .systemFont(ofSize: 9, weight: .bold)
    let group = UIStackView(arrangedSubviews: [label, field])
    group.axis = .vertical
    group.spacing = 5
    return group
  }

  private func pair(_ left: UIView, _ right: UIView) -> UIStackView {
    let pair = UIStackView(arrangedSubviews: [left, right])
    pair.axis = .horizontal
    pair.spacing = 9
    pair.distribution = .fillEqually
    return pair
  }

  private func makeAmenitySummary() -> UIView? {
    let amenities = stringArray("amenities")
    guard !amenities.isEmpty else { return nil }

    let label = UILabel()
    label.text = "GOOD THINGS FOUND"
    label.textColor = HomeboardSharePalette.secondaryText.withAlphaComponent(0.76)
    label.font = .systemFont(ofSize: 9, weight: .bold)

    let values = InsetLabel()
    values.text = amenities.prefix(8).map { "✓ \($0.capitalized)" }.joined(separator: "   ")
    values.textColor = accentColor
    values.font = .systemFont(ofSize: 12, weight: .semibold)
    values.numberOfLines = 0
    values.backgroundColor = accentColor.withAlphaComponent(0.08)
    values.layer.cornerRadius = 13
    values.layer.masksToBounds = true
    values.textAlignment = .left
    values.contentInsets = UIEdgeInsets(top: 11, left: 12, bottom: 11, right: 12)

    let group = UIStackView(arrangedSubviews: [label, values])
    group.axis = .vertical
    group.spacing = 5
    return group
  }

  private func populateFields() {
    addressField.text = string("address")
    unitField.text = string("unit")?.uppercased()
    neighborhoodField.text = string("neighborhood") ?? string("city")
    priceField.text = number("price").map { "$\(format($0))" }
    bedroomsField.text = number("bedrooms").map(format)
    bathroomsField.text = number("bathrooms").map(format)
  }

  private func renderOptions() {
    for option in analysis.options {
      var configuration = UIButton.Configuration.gray()
      configuration.cornerStyle = .medium
      configuration.baseForegroundColor = HomeboardSharePalette.primaryText
      configuration.baseBackgroundColor = surfaceColor
      configuration.title = option.label
      configuration.subtitle = optionSummary(option)
      configuration.titleAlignment = .leading
      configuration.contentInsets = NSDirectionalEdgeInsets(
        top: 11,
        leading: 13,
        bottom: 11,
        trailing: 13
      )
      let button = UIButton(configuration: configuration)
      button.contentHorizontalAlignment = .leading
      button.addAction(UIAction { [weak self, option] _ in
        self?.select(option)
      }, for: .touchUpInside)
      optionStack.addArrangedSubview(button)
    }
  }

  private func select(_ option: HomeboardUnitOption) {
    values["unit"] = option.unit
    values["price"] = option.price
    values["bedrooms"] = option.bedrooms
    values["bathrooms"] = option.bathrooms
    values["squareFeet"] = option.squareFeet
    values["availableDate"] = option.availableDate
    values["listingScope"] = "unit"
    unitField.text = option.unit?.uppercased()
    priceField.text = option.price.map { "$\(format($0))" }
    bedroomsField.text = option.bedrooms.map(format)
    bathroomsField.text = option.bathrooms.map(format)
    optionStack.isHidden = true
    detailsStack.isHidden = false
    statusLabel.text = option.availableDate.map {
      "Unit selected · available \($0). Confirm the scanned details, then save."
    } ?? "Option selected. Confirm the scanned details, then save."
    updateSaveState()
  }

  private func optionSummary(_ option: HomeboardUnitOption) -> String {
    [
      option.price.map { "$\(format($0))" },
      option.bedrooms.map { "\(format($0)) bed" },
      option.bathrooms.map { "\(format($0)) bath" },
      option.squareFeet.map { "\($0) sq ft" },
      option.availableDate.map { "available \($0)" }
    ].compactMap { $0 }.joined(separator: "  ·  ")
  }

  private func merge(_ facts: HomeboardListingFacts) {
    assignIfMissing("address", facts.address)
    assignIfMissing("unit", facts.unit)
    assignIfMissing("city", facts.city)
    assignIfMissing("neighborhood", facts.neighborhood)
    assignIfMissing("price", facts.price)
    assignIfMissing("bedrooms", facts.bedrooms)
    assignIfMissing("bathrooms", facts.bathrooms)
    assignIfMissing("squareFeet", facts.squareFeet)
    assignIfMissing("imageURL", facts.imageURL)
    assignIfMissing("summary", facts.summary)
    var seen = Set<String>()
    let mergedAmenities: [String] = (stringArray("amenities") + facts.amenities)
      .compactMap { value -> String? in
      let cleaned = value.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
      guard !cleaned.isEmpty, seen.insert(cleaned).inserted else { return nil }
      return cleaned
    }
    values["amenities"] = mergedAmenities
  }

  @objc private func fieldChanged() {
    unitField.text = unitField.text?.uppercased()
    updateSaveState()
  }

  private func requiredFieldsMissing() -> [String] {
    [
      (addressField, "address"),
      (priceField, "rent"),
      (bedroomsField, "bedrooms"),
      (bathroomsField, "bathrooms")
    ].compactMap { field, label in
      field.text?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty == false
        ? nil
        : label
    }
  }

  private func updateSaveState() {
    let required = [addressField, priceField, bedroomsField, bathroomsField]
    required.forEach { field in
      let missing = field.text?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty != false
      field.layer.borderColor = missing
        ? HomeboardSharePalette.danger.withAlphaComponent(0.78).cgColor
        : HomeboardSharePalette.border.withAlphaComponent(0.46).cgColor
    }
    saveButton.isEnabled = requiredFieldsMissing().isEmpty && analysis.options.isEmpty
      || requiredFieldsMissing().isEmpty && optionStack.isHidden
    saveButton.alpha = saveButton.isEnabled ? 1 : 0.45
  }

  @objc private func save() {
    guard requiredFieldsMissing().isEmpty else {
      statusLabel.text = "Confirm the highlighted details before saving."
      updateSaveState()
      return
    }

    let pending = HomeboardSharedImportStore.PendingImport(
      url: url.absoluteString,
      canonicalURL: string("canonicalURL"),
      boardId: HomeboardSharedImportStore.activeBoardId,
      sourceName: string("sourceName") ?? providerName,
      pageTitle: string("pageTitle"),
      address: addressField.text,
      unit: unitField.text?.uppercased(),
      city: string("city"),
      neighborhood: neighborhoodField.text,
      latitude: number("latitude"),
      longitude: number("longitude"),
      price: numeric(priceField.text),
      bedrooms: numeric(bedroomsField.text),
      bathrooms: numeric(bathroomsField.text),
      squareFeet: number("squareFeet").map { Int($0.rounded()) },
      availableDate: string("availableDate"),
      imageURL: string("imageURL"),
      summary: string("summary"),
      amenities: stringArray("amenities"),
      modelInsights: analysis.facts.insights,
      listingScope: string("listingScope") ?? analysis.scope,
      extractionConfidence: "reviewed"
    )
    saveButton.isEnabled = false
    saveButton.setTitle("Saving to Homeboard…", for: .normal)
    onSave?(pending)
  }

  @objc private func rescan() {
    onRescan?()
  }

  func textFieldShouldReturn(_ textField: UITextField) -> Bool {
    textField.resignFirstResponder()
    return true
  }

  private func assignIfMissing(_ key: String, _ value: Any?) {
    guard values[key] == nil, let value else { return }
    values[key] = value
  }

  private func string(_ key: String) -> String? {
    guard let value = values[key] as? String else { return nil }
    let result = value.trimmingCharacters(in: .whitespacesAndNewlines)
    return result.isEmpty ? nil : result
  }

  private func number(_ key: String) -> Double? {
    if let value = values[key] as? NSNumber { return value.doubleValue }
    if let value = values[key] as? String { return numeric(value) }
    return nil
  }

  private func stringArray(_ key: String) -> [String] {
    values[key] as? [String] ?? []
  }

  private func numeric(_ input: String?) -> Double? {
    guard let input else { return nil }
    let raw = input.filter { $0.isNumber || $0 == "." }
    return raw.isEmpty ? nil : Double(raw)
  }

  private func format(_ value: Double) -> String {
    value.rounded() == value
      ? String(Int(value))
      : String(format: "%.1f", value)
  }
}

private final class InsetLabel: UILabel {
  var contentInsets = UIEdgeInsets.zero {
    didSet { invalidateIntrinsicContentSize() }
  }

  override func drawText(in rect: CGRect) {
    super.drawText(in: rect.inset(by: contentInsets))
  }

  override var intrinsicContentSize: CGSize {
    let size = super.intrinsicContentSize
    return CGSize(
      width: size.width + contentInsets.left + contentInsets.right,
      height: size.height + contentInsets.top + contentInsets.bottom
    )
  }
}
