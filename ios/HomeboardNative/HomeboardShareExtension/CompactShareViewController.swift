import Foundation
import LinkPresentation
import UIKit
import UniformTypeIdentifiers
import WebKit

private let compactLinkMetadataTypeIdentifier = "com.apple.linkpresentation.metadata"

private enum CompactSharePalette {
  static let background = UIColor(red: 61 / 255, green: 80 / 255, blue: 74 / 255, alpha: 1)
  static let surface = UIColor(red: 49 / 255, green: 68 / 255, blue: 62 / 255, alpha: 1)
  static let accent = UIColor(red: 249 / 255, green: 226 / 255, blue: 205 / 255, alpha: 1)
  static let primaryText = UIColor(red: 255 / 255, green: 243 / 255, blue: 229 / 255, alpha: 1)
  static let secondaryText = UIColor(red: 231 / 255, green: 218 / 255, blue: 206 / 255, alpha: 1)
  static let border = UIColor(red: 146 / 255, green: 167 / 255, blue: 158 / 255, alpha: 1)
  static let buttonText = UIColor(red: 36 / 255, green: 49 / 255, blue: 41 / 255, alpha: 1)
  static let danger = UIColor(red: 255 / 255, green: 180 / 255, blue: 171 / 255, alpha: 1)
}

private struct CompactLoadedSharePayload {
  var url: URL?
  var title: String?
  var preprocessedValues: [String: Any]?
}

private final class CompactPayloadAccumulator: @unchecked Sendable {
  private let lock = NSLock()
  private var values: [CompactLoadedSharePayload] = []

  func append(_ value: CompactLoadedSharePayload) {
    lock.lock()
    values.append(value)
    lock.unlock()
  }

  func best(fallbackURL: URL?, fallbackTitle: String?) -> CompactLoadedSharePayload {
    lock.lock()
    let snapshot = values
    lock.unlock()
    let preprocessed = snapshot.compactMap(\.preprocessedValues).first
    let url = Self.webURL(in: preprocessed)
      ?? snapshot.compactMap(\.url).first
      ?? fallbackURL
    let title = snapshot.compactMap(\.title).first
      ?? Self.string(in: preprocessed, keys: ["pageTitle", "title"])
      ?? fallbackTitle
    return CompactLoadedSharePayload(
      url: url,
      title: title,
      preprocessedValues: preprocessed
    )
  }

  private static func webURL(in values: [String: Any]?) -> URL? {
    guard let value = string(in: values, keys: ["url", "canonicalURL"]),
          let url = URL(string: value),
          ["http", "https"].contains(url.scheme?.lowercased() ?? "")
    else { return nil }
    return url
  }

  private static func string(
    in values: [String: Any]?,
    keys: [String]
  ) -> String? {
    guard let values else { return nil }
    for key in keys {
      if let value = values[key] as? String {
        let cleaned = value.trimmingCharacters(in: .whitespacesAndNewlines)
        if !cleaned.isEmpty { return cleaned }
      }
    }
    return nil
  }
}

private struct CompactZillowSnapshot: @unchecked Sendable {
  var values: [String: Any]
  var unitCount: Int
}

private enum CompactZillowSnapshotLoader {
  private static let maximumResponseBytes = 5_000_000

  static func load(
    url: URL,
    fallbackTitle: String?
  ) async -> CompactZillowSnapshot? {
    guard isZillow(url) else { return nil }
    var request = URLRequest(
      url: url,
      cachePolicy: .useProtocolCachePolicy,
      timeoutInterval: 7
    )
    request.setValue(
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) "
        + "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
      forHTTPHeaderField: "User-Agent"
    )
    request.setValue("text/html,application/xhtml+xml", forHTTPHeaderField: "Accept")
    request.setValue("en-US,en;q=0.9", forHTTPHeaderField: "Accept-Language")

    do {
      let (data, response) = try await URLSession.shared.data(for: request)
      guard
        let response = response as? HTTPURLResponse,
        (200..<300).contains(response.statusCode),
        !data.isEmpty,
        data.count <= maximumResponseBytes
      else { return nil }
      return await Task.detached(priority: .userInitiated) {
        parse(data: data, url: url, fallbackTitle: fallbackTitle)
      }.value
    } catch {
      return nil
    }
  }

  private static func parse(
    data: Data,
    url: URL,
    fallbackTitle: String?
  ) -> CompactZillowSnapshot? {
    guard
      let html = String(data: data, encoding: .utf8),
      let nextData = firstCapture(
        in: html,
        pattern: #"<script\b(?=[^>]*\bid\s*=\s*[\"']__NEXT_DATA__[\"'])[^>]*>([\s\S]*?)</script\s*>"#
      ),
      let jsonData = nextData.data(using: .utf8),
      let root = try? JSONSerialization.jsonObject(with: jsonData),
      let building = matchingBuilding(in: root, pageURL: url),
      let address = string(building["fullAddress"]),
      !address.isEmpty
    else { return nil }

    let options = unitOptions(in: building)
    guard !options.isEmpty else { return nil }

    let declaredCount = dictionary(building["rentalUnitsSummary"])
      .flatMap { integer($0["availableUnitCount"]) ?? integer($0["unitCount"]) }
    // A partial snapshot is worse than the live page for a building. Only win
    // the race when Zillow's own declared count matches every parsed unit.
    if let declaredCount, declaredCount > 0, options.count != declaredCount {
      return nil
    }

    let structuredEvidence = options.compactMap(jsonLine).joined(separator: "\n")
    let availableCount = declaredCount ?? options.count
    let buildingName = string(building["buildingName"])
    let description = string(building["description"])
    let evidence = [
      buildingName.map { "TITLE: \($0)" },
      "ADDRESS: \(address)",
      "\(availableCount) available units for rent",
      "AVAILABLE UNITS:\n\(structuredEvidence)",
      description.map { "DESCRIPTION: \(String($0.prefix(2_400)))" }
    ]
      .compactMap { $0 }
      .joined(separator: "\n\n")

    var values: [String: Any] = [
      "url": url.absoluteString,
      "canonicalURL": canonicalURL(building: building, fallback: url),
      "sourceName": "Zillow",
      "pageTitle": buildingName ?? fallbackTitle ?? address,
      "address": address,
      "listingScope": "building",
      "sharedPageEvidence": [buildingName, address].compactMap { $0 }.joined(separator: "\n"),
      "primaryPageEvidence": evidence,
      "pageEvidence": evidence,
      "availabilityPageEvidence": "\(availableCount) available units for rent\n\(structuredEvidence)",
      "structuredUnitEvidence": structuredEvidence,
      "unitOptions": options,
      "addressEvidence": [["text": address, "source": "zillow-next-data"]]
    ]
    if let city = string(building["city"]) { values["city"] = city }
    if let region = string(building["state"]) { values["region"] = region }
    if let postalCode = string(building["zipcode"]) { values["postalCode"] = postalCode }
    if let neighborhood = string(building["neighborhood"]) { values["neighborhood"] = neighborhood }
    if let latitude = number(building["latitude"]) { values["latitude"] = latitude }
    if let longitude = number(building["longitude"]) { values["longitude"] = longitude }
    if let description { values["summary"] = String(description.prefix(1_200)) }
    if let imageURL = firstImageURL(in: building["signaturePhotos"])
      ?? firstImageURL(in: building["photos"])
      ?? previewImageURL(in: html, relativeTo: url)
    {
      values["imageURL"] = imageURL
    }
    return CompactZillowSnapshot(values: values, unitCount: options.count)
  }

  private static func matchingBuilding(in root: Any, pageURL: URL) -> [String: Any]? {
    if let knownValue = value(
      in: root,
      path: ["props", "pageProps", "componentProps", "initialReduxState", "gdp", "building"]
    ), let known = dictionary(knownValue), buildingMatches(known, pageURL: pageURL) {
      return known
    }

    var remainingNodes = 20_000
    return findBuilding(in: root, pageURL: pageURL, depth: 0, remainingNodes: &remainingNodes)
  }

  private static func findBuilding(
    in value: Any,
    pageURL: URL,
    depth: Int,
    remainingNodes: inout Int
  ) -> [String: Any]? {
    guard depth <= 12, remainingNodes > 0 else { return nil }
    remainingNodes -= 1
    if let object = dictionary(value) {
      if buildingMatches(object, pageURL: pageURL) { return object }
      for child in object.values {
        if let match = findBuilding(
          in: child,
          pageURL: pageURL,
          depth: depth + 1,
          remainingNodes: &remainingNodes
        ) { return match }
      }
    } else if let array = value as? [Any] {
      for child in array {
        if let match = findBuilding(
          in: child,
          pageURL: pageURL,
          depth: depth + 1,
          remainingNodes: &remainingNodes
        ) { return match }
      }
    }
    return nil
  }

  private static func buildingMatches(_ value: [String: Any], pageURL: URL) -> Bool {
    guard
      let plans = value["floorPlans"] as? [Any],
      !plans.isEmpty,
      let path = string(value["bdpUrl"])
    else { return false }
    return normalizedPath(path, relativeTo: pageURL) == normalizedPath(
      pageURL.absoluteString,
      relativeTo: pageURL
    )
  }

  private static func unitOptions(in building: [String: Any]) -> [[String: Any]] {
    var result: [[String: Any]] = []
    var seen = Set<String>()
    let plans = dictionaries(building["floorPlans"])
    for plan in plans {
      for unit in dictionaries(plan["units"]) {
        let status = ["status", "availability", "availabilityStatus"]
          .compactMap { string(unit[$0]) }
          .joined(separator: " ")
          .lowercased()
        if status.range(
          of: #"\b(?:unavailable|leased|rented|off.?market|waitlist)\b"#,
          options: .regularExpression
        ) != nil { continue }

        guard
          let rawUnit = string(unit["unitNumber"]),
          let price = number(unit["price"])
            ?? number(unit["baseRent"])
            ?? number(plan["minPrice"])
            ?? number(plan["minBaseRent"]),
          let bedrooms = number(unit["beds"]) ?? number(plan["beds"]),
          let bathrooms = number(unit["baths"]) ?? number(plan["baths"]),
          price > 0,
          bedrooms >= 0,
          bathrooms > 0
        else { continue }

        let identity = rawUnit
          .lowercased()
          .replacingOccurrences(
            of: #"^(?:unit|apt\.?|apartment|#)\s*"#,
            with: "",
            options: .regularExpression
          )
          .trimmingCharacters(in: .whitespacesAndNewlines)
        guard !identity.isEmpty, seen.insert(identity).inserted else { continue }

        var option: [String: Any] = [
          "id": string(unit["zpid"]) ?? identity,
          "label": rawUnit,
          "unit": rawUnit,
          "price": price,
          "bedrooms": bedrooms,
          "bathrooms": bathrooms
        ]
        if let squareFeet = integer(unit["sqft"]) ?? integer(plan["sqft"]) {
          option["squareFeet"] = squareFeet
        }
        if let date = availableDate(unit["availableFrom"] ?? plan["availableFrom"]) {
          option["availableDate"] = date
        }
        result.append(option)
        if result.count >= 50 { return result }
      }
    }
    return result
  }

  private static func value(in root: Any, path: [String]) -> Any? {
    var current: Any? = root
    for key in path {
      guard let object = dictionary(current) else { return nil }
      current = object[key]
    }
    return current
  }

  private static func dictionary(_ value: Any?) -> [String: Any]? {
    value as? [String: Any]
  }

  private static func dictionaries(_ value: Any?) -> [[String: Any]] {
    (value as? [Any] ?? []).compactMap(dictionary)
  }

  private static func string(_ value: Any?) -> String? {
    guard let value = value as? String else { return nil }
    let cleaned = value
      .replacingOccurrences(of: #"\s+"#, with: " ", options: .regularExpression)
      .trimmingCharacters(in: .whitespacesAndNewlines)
    return cleaned.isEmpty ? nil : cleaned
  }

  private static func number(_ value: Any?) -> Double? {
    if let value = value as? NSNumber { return value.doubleValue }
    if let value = string(value) {
      return Double(value.replacingOccurrences(of: ",", with: ""))
    }
    return nil
  }

  private static func integer(_ value: Any?) -> Int? {
    number(value).flatMap { Int(exactly: $0) }
  }

  private static func availableDate(_ value: Any?) -> String? {
    if let raw = string(value), !raw.allSatisfy(\.isNumber) { return raw }
    guard var timestamp = number(value) else { return nil }
    if timestamp > 10_000_000_000 { timestamp /= 1_000 }
    guard timestamp > 0 else { return nil }
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withFullDate]
    return formatter.string(from: Date(timeIntervalSince1970: timestamp))
  }

  private static func canonicalURL(building: [String: Any], fallback: URL) -> String {
    guard let path = string(building["bdpUrl"]),
          let resolved = URL(string: path, relativeTo: fallback)?.absoluteURL
    else { return fallback.absoluteString }
    return resolved.absoluteString
  }

  private static func normalizedPath(_ value: String, relativeTo baseURL: URL) -> String {
    let path = URL(string: value, relativeTo: baseURL)?.absoluteURL.path ?? value
    return path.lowercased().trimmingCharacters(in: CharacterSet(charactersIn: "/"))
  }

  private static func firstImageURL(in value: Any?, depth: Int = 0) -> String? {
    guard depth <= 8 else { return nil }
    if let text = string(value),
       let url = URL(string: text),
       ["http", "https"].contains(url.scheme?.lowercased() ?? "")
    {
      return url.absoluteString
    }
    if let object = dictionary(value) {
      for key in ["url", "src", "imageUrl"] {
        if let match = firstImageURL(in: object[key], depth: depth + 1) { return match }
      }
      for child in object.values {
        if let match = firstImageURL(in: child, depth: depth + 1) { return match }
      }
    } else if let array = value as? [Any] {
      for child in array {
        if let match = firstImageURL(in: child, depth: depth + 1) { return match }
      }
    }
    return nil
  }

  private static func previewImageURL(in html: String, relativeTo baseURL: URL) -> String? {
    let patterns = [
      #"<meta\b(?=[^>]*(?:property|name|itemprop)\s*=\s*[\"'](?:og:image(?::(?:url|secure_url))?|twitter:image(?::src)?|image)[\"'])(?=[^>]*content\s*=\s*[\"']([^\"']+)[\"'])[^>]*>"#,
      #"<link\b(?=[^>]*rel\s*=\s*[\"']image_src[\"'])(?=[^>]*href\s*=\s*[\"']([^\"']+)[\"'])[^>]*>"#
    ]
    for pattern in patterns {
      guard let rawValue = firstCapture(in: html, pattern: pattern) else { continue }
      let decodedValue = rawValue
        .replacingOccurrences(of: "&amp;", with: "&", options: .caseInsensitive)
        .replacingOccurrences(of: "&#38;", with: "&", options: .caseInsensitive)
        .replacingOccurrences(of: "&quot;", with: "\"")
      guard
        let resolved = URL(string: decodedValue, relativeTo: baseURL)?.absoluteURL,
        ["http", "https"].contains(resolved.scheme?.lowercased() ?? "")
      else { continue }
      return resolved.absoluteString
    }
    return nil
  }

  private static func jsonLine(_ value: [String: Any]) -> String? {
    guard let data = try? JSONSerialization.data(withJSONObject: value, options: [.sortedKeys]) else {
      return nil
    }
    return String(data: data, encoding: .utf8)
  }

  private static func firstCapture(in value: String, pattern: String) -> String? {
    guard let expression = try? NSRegularExpression(pattern: pattern, options: [.caseInsensitive]) else {
      return nil
    }
    let range = NSRange(value.startIndex..<value.endIndex, in: value)
    guard
      let match = expression.firstMatch(in: value, range: range),
      let captureRange = Range(match.range(at: 1), in: value)
    else { return nil }
    return String(value[captureRange])
  }

  private static func isZillow(_ url: URL) -> Bool {
    guard let host = url.host?.lowercased() else { return false }
    return host == "zillow.com" || host.hasSuffix(".zillow.com")
  }
}

private struct CompactListingChoice {
  var title: String
  var subtitle: String
  var price: String?
  var pendingImport: HomeboardSharedImportStore.PendingImport?
  var isConfirmed: Bool
}

private enum CompactShareItem {
  case listing(CompactListingChoice)
  case edit
}

final class CompactShareViewController: UIViewController {
  private let brandLabel = UILabel()
  private let statusLabel = UILabel()
  private let addressLabel = UILabel()
  private let loadingView = UIActivityIndicatorView(style: .medium)
  private let choicesContainer = UIView()
  private let editContainer = UIView()
  private let editStatusLabel = UILabel()
  private let addressField = UITextField()
  private let unitField = UITextField()
  private let priceField = UITextField()
  private let bedroomsField = UITextField()
  private let bathroomsField = UITextField()
  private let editSaveButton = UIButton(type: .system)

  private lazy var collectionView = UICollectionView(
    frame: .zero,
    collectionViewLayout: makeVerticalListLayout()
  )

  private lazy var webView: WKWebView = {
    let configuration = WKWebViewConfiguration()
    configuration.websiteDataStore = .default()
    configuration.defaultWebpagePreferences.allowsContentJavaScript = true
    let webView = WKWebView(frame: .zero, configuration: configuration)
    webView.navigationDelegate = self
    webView.isOpaque = false
    webView.alpha = 0.01
    webView.isUserInteractionEnabled = false
    webView.accessibilityElementsHidden = true
    webView.customUserAgent =
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) "
      + "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1"
    return webView
  }()

  private var items: [CompactShareItem] = []
  private var choicesBottomConstraint: NSLayoutConstraint?
  private var extractedValues: [String: Any] = [:]
  private var analysis: HomeboardListingAnalysis?
  private var sharedURL: URL?
  private var sharedTitle: String?
  private var sharedPreviewImageData: Data?
  private var queuedImportIDForPreview: UUID?
  private var hasResolvedPayload = false
  private var hasStarted = false
  private var hasStartedPageExtraction = false
  private var hasStartedModelAnalysis = false
  private var hasFinished = false
  private var usesSafariFinalize = false
  private var navigationTimeout: DispatchWorkItem?
  private var analysisTask: Task<Void, Never>?
  private var snapshotTask: Task<Void, Never>?

  override func viewDidLoad() {
    super.viewDidLoad()
    view.backgroundColor = CompactSharePalette.background
    preferredContentSize = CGSize(width: max(view.bounds.width, 390), height: 720)
    configureLayout()
    startIfNeeded()
    _ = HomeboardShareBootDiagnosticStore.append(
      stage: "compactController.ready",
      detail: "Compact native-app share interface is visible"
    )
  }

  override func viewDidAppear(_ animated: Bool) {
    super.viewDidAppear(animated)
    startIfNeeded()
  }

  deinit {
    analysisTask?.cancel()
    snapshotTask?.cancel()
    navigationTimeout?.cancel()
  }

  private func configureLayout() {
    brandLabel.text = "HOMEBOARD"
    brandLabel.textColor = CompactSharePalette.accent
    brandLabel.font = .systemFont(ofSize: 11, weight: .heavy)
    brandLabel.setContentHuggingPriority(.required, for: .horizontal)

    loadingView.color = CompactSharePalette.accent
    loadingView.startAnimating()
    loadingView.setContentHuggingPriority(.required, for: .horizontal)

    let header = UIStackView(arrangedSubviews: [brandLabel, UIView(), loadingView])
    header.axis = .horizontal
    header.alignment = .center

    statusLabel.text = "Reading the listing…"
    statusLabel.textColor = CompactSharePalette.primaryText
    statusLabel.font = .systemFont(ofSize: 19, weight: .bold)
    statusLabel.numberOfLines = 1

    addressLabel.text = "This should only take a moment."
    addressLabel.textColor = CompactSharePalette.secondaryText.withAlphaComponent(0.82)
    addressLabel.font = .systemFont(ofSize: 12, weight: .medium)
    addressLabel.numberOfLines = 1
    addressLabel.lineBreakMode = .byTruncatingTail

    choicesContainer.translatesAutoresizingMaskIntoConstraints = false
    collectionView.translatesAutoresizingMaskIntoConstraints = false
    collectionView.backgroundColor = .clear
    collectionView.showsHorizontalScrollIndicator = false
    collectionView.showsVerticalScrollIndicator = true
    collectionView.alwaysBounceVertical = false
    collectionView.contentInsetAdjustmentBehavior = .never
    collectionView.dataSource = self
    collectionView.delegate = self
    collectionView.register(
      CompactListingChoiceCell.self,
      forCellWithReuseIdentifier: CompactListingChoiceCell.reuseIdentifier
    )
    collectionView.isHidden = true
    choicesContainer.addSubview(collectionView)
    NSLayoutConstraint.activate([
      collectionView.topAnchor.constraint(equalTo: choicesContainer.topAnchor),
      collectionView.leadingAnchor.constraint(equalTo: choicesContainer.leadingAnchor),
      collectionView.trailingAnchor.constraint(equalTo: choicesContainer.trailingAnchor),
      collectionView.bottomAnchor.constraint(equalTo: choicesContainer.bottomAnchor),
      choicesContainer.heightAnchor.constraint(greaterThanOrEqualToConstant: 104)
    ])

    configureEditForm()

    let rootStack = UIStackView(
      arrangedSubviews: [header, statusLabel, addressLabel, choicesContainer, editContainer]
    )
    rootStack.axis = .vertical
    rootStack.spacing = 7
    rootStack.setCustomSpacing(12, after: addressLabel)
    rootStack.translatesAutoresizingMaskIntoConstraints = false
    view.addSubview(rootStack)
    NSLayoutConstraint.activate([
      rootStack.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 15),
      rootStack.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 18),
      rootStack.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -18),
      rootStack.bottomAnchor.constraint(
        lessThanOrEqualTo: view.safeAreaLayoutGuide.bottomAnchor,
        constant: 0
      )
    ])
    let choicesBottomConstraint = choicesContainer.bottomAnchor.constraint(
      equalTo: view.safeAreaLayoutGuide.bottomAnchor,
      constant: 0
    )
    choicesBottomConstraint.isActive = true
    self.choicesBottomConstraint = choicesBottomConstraint

    webView.translatesAutoresizingMaskIntoConstraints = false
    view.insertSubview(webView, at: 0)
    NSLayoutConstraint.activate([
      webView.widthAnchor.constraint(equalToConstant: 390),
      webView.heightAnchor.constraint(equalToConstant: 844),
      webView.trailingAnchor.constraint(equalTo: view.leadingAnchor, constant: -4),
      webView.bottomAnchor.constraint(equalTo: view.topAnchor, constant: -4)
    ])
  }

  private func configureEditForm() {
    editContainer.isHidden = true
    editContainer.translatesAutoresizingMaskIntoConstraints = false

    [addressField, unitField, priceField, bedroomsField, bathroomsField].forEach(configureField)
    addressField.placeholder = "Address"
    addressField.textContentType = .fullStreetAddress
    unitField.placeholder = "Unit"
    priceField.placeholder = "Monthly rent"
    priceField.keyboardType = .decimalPad
    bedroomsField.placeholder = "Beds"
    bedroomsField.keyboardType = .decimalPad
    bathroomsField.placeholder = "Baths"
    bathroomsField.keyboardType = .decimalPad

    let unitAndPrice = UIStackView(arrangedSubviews: [unitField, priceField])
    unitAndPrice.axis = .horizontal
    unitAndPrice.spacing = 8
    unitAndPrice.distribution = .fillEqually
    let bedsAndBaths = UIStackView(arrangedSubviews: [bedroomsField, bathroomsField])
    bedsAndBaths.axis = .horizontal
    bedsAndBaths.spacing = 8
    bedsAndBaths.distribution = .fillEqually

    editStatusLabel.textColor = CompactSharePalette.danger
    editStatusLabel.font = .systemFont(ofSize: 11, weight: .semibold)
    editStatusLabel.numberOfLines = 2
    editStatusLabel.isHidden = true

    var saveConfiguration = UIButton.Configuration.filled()
    saveConfiguration.title = "Save details"
    saveConfiguration.baseBackgroundColor = CompactSharePalette.accent
    saveConfiguration.baseForegroundColor = CompactSharePalette.buttonText
    saveConfiguration.cornerStyle = .capsule
    saveConfiguration.contentInsets = NSDirectionalEdgeInsets(
      top: 11,
      leading: 16,
      bottom: 11,
      trailing: 16
    )
    editSaveButton.configuration = saveConfiguration
    editSaveButton.titleLabel?.font = .systemFont(ofSize: 14, weight: .bold)
    editSaveButton.addTarget(self, action: #selector(saveEditedDetails), for: .touchUpInside)

    let backButton = UIButton(type: .system)
    backButton.setTitle("Back to options", for: .normal)
    backButton.setTitleColor(CompactSharePalette.secondaryText, for: .normal)
    backButton.titleLabel?.font = .systemFont(ofSize: 13, weight: .semibold)
    backButton.addTarget(self, action: #selector(hideEditForm), for: .touchUpInside)

    let actions = UIStackView(arrangedSubviews: [backButton, editSaveButton])
    actions.axis = .horizontal
    actions.alignment = .center
    actions.distribution = .fillEqually
    actions.spacing = 8

    let editStack = UIStackView(
      arrangedSubviews: [addressField, unitAndPrice, bedsAndBaths, editStatusLabel, actions]
    )
    editStack.axis = .vertical
    editStack.spacing = 8
    editStack.translatesAutoresizingMaskIntoConstraints = false
    editContainer.addSubview(editStack)
    NSLayoutConstraint.activate([
      editStack.topAnchor.constraint(equalTo: editContainer.topAnchor),
      editStack.leadingAnchor.constraint(equalTo: editContainer.leadingAnchor),
      editStack.trailingAnchor.constraint(equalTo: editContainer.trailingAnchor),
      editStack.bottomAnchor.constraint(equalTo: editContainer.bottomAnchor)
    ])
  }

  private func configureField(_ field: UITextField) {
    field.translatesAutoresizingMaskIntoConstraints = false
    field.heightAnchor.constraint(equalToConstant: 42).isActive = true
    field.backgroundColor = CompactSharePalette.surface
    field.textColor = CompactSharePalette.primaryText
    field.tintColor = CompactSharePalette.accent
    field.font = .systemFont(ofSize: 14, weight: .medium)
    field.layer.cornerRadius = 12
    field.layer.borderWidth = 1
    field.layer.borderColor = CompactSharePalette.border.withAlphaComponent(0.38).cgColor
    field.autocorrectionType = .no
    field.leftView = UIView(frame: CGRect(x: 0, y: 0, width: 12, height: 1))
    field.leftViewMode = .always
    field.rightView = UIView(frame: CGRect(x: 0, y: 0, width: 12, height: 1))
    field.rightViewMode = .always
  }

  private func makeVerticalListLayout() -> UICollectionViewLayout {
    UICollectionViewCompositionalLayout { _, _ in
      let itemSize = NSCollectionLayoutSize(
        widthDimension: .fractionalWidth(1),
        heightDimension: .absolute(84)
      )
      let item = NSCollectionLayoutItem(layoutSize: itemSize)
      let group = NSCollectionLayoutGroup.vertical(layoutSize: itemSize, subitems: [item])
      let section = NSCollectionLayoutSection(group: group)
      section.interGroupSpacing = 10
      section.contentInsets = NSDirectionalEdgeInsets(top: 2, leading: 0, bottom: 12, trailing: 0)
      return section
    }
  }

  private func startIfNeeded() {
    guard !hasStarted else { return }
    hasStarted = true
    loadSharedPayload()
  }

  private func loadSharedPayload() {
    let inputItems = extensionContext?.inputItems.compactMap { $0 as? NSExtensionItem } ?? []
    let itemText = inputItems.flatMap {
      [$0.attributedContentText?.string, $0.attributedTitle?.string].compactMap { $0 }
    }
    let fallbackURL = itemText.compactMap(firstWebURL).first
    let fallbackTitle = itemText
      .map(cleanedTitle)
      .first(where: { !$0.isEmpty })
    let providers = inputItems.flatMap { $0.attachments ?? [] }
    let accumulator = CompactPayloadAccumulator()
    let group = DispatchGroup()

    let resolveBestPayload = { [weak self] (requireURL: Bool) in
      guard let self, !self.hasResolvedPayload else { return }
      let payload = accumulator.best(
        fallbackURL: fallbackURL,
        fallbackTitle: fallbackTitle
      )
      if requireURL, payload.url == nil { return }
      self.hasResolvedPayload = true
      self.resolve(payload)
    }

    for provider in providers {
      if provider.hasItemConformingToTypeIdentifier(UTType.image.identifier) {
        capturePreviewImage(from: provider)
      }
      for identifier in readableTypeIdentifiers(for: provider) {
        group.enter()
        provider.loadItem(forTypeIdentifier: identifier, options: nil) { [weak self] item, _ in
          if let self {
            let payload = self.decodeSharePayload(item)
            accumulator.append(payload)
            if payload.url != nil || payload.preprocessedValues != nil {
              // Rich-link providers sometimes keep generating previews after the
              // actual URL is ready. Coalesce briefly for accompanying text, then
              // start loading the listing instead of waiting for every attachment.
              DispatchQueue.main.asyncAfter(deadline: .now() + 0.12) {
                resolveBestPayload(true)
              }
            }
          }
          group.leave()
        }
      }
    }

    group.notify(queue: .main) {
      resolveBestPayload(false)
    }
    DispatchQueue.main.asyncAfter(deadline: .now() + 3.5) {
      resolveBestPayload(false)
    }
  }

  private func readableTypeIdentifiers(for provider: NSItemProvider) -> [String] {
    let preferred = [
      compactLinkMetadataTypeIdentifier,
      UTType.propertyList.identifier,
      UTType.url.identifier,
      UTType.plainText.identifier,
      UTType.text.identifier
    ]
    var result: [String] = []
    for identifier in preferred where
      provider.hasItemConformingToTypeIdentifier(identifier)
      && !result.contains(identifier)
    {
      result.append(identifier)
    }
    if result.isEmpty {
      result = provider.registeredTypeIdentifiers.filter { identifier in
        let lowercased = identifier.lowercased()
        let type = UTType(identifier)
        return type?.conforms(to: .url) == true
          || type?.conforms(to: .text) == true
          || type?.conforms(to: .propertyList) == true
          || lowercased.contains("linkpresentation")
          || lowercased.contains("link-metadata")
      }
    }
    return result
  }

  private func decodeSharePayload(_ item: Any?) -> CompactLoadedSharePayload {
    guard let item else { return CompactLoadedSharePayload() }
    if let url = item as? URL {
      return CompactLoadedSharePayload(url: validatedWebURL(url))
    }
    if let url = item as? NSURL {
      return CompactLoadedSharePayload(url: validatedWebURL(url as URL))
    }
    if let value = item as? NSAttributedString {
      return CompactLoadedSharePayload(
        url: firstWebURL(in: value.string),
        title: cleanedTitle(value.string)
      )
    }
    if let value = item as? String {
      return CompactLoadedSharePayload(
        url: firstWebURL(in: value) ?? validatedWebURL(URL(string: value)),
        title: cleanedTitle(value)
      )
    }
    if let metadata = item as? LPLinkMetadata {
      capturePreviewImage(from: metadata.imageProvider)
      return CompactLoadedSharePayload(
        url: validatedWebURL(metadata.originalURL)
          ?? validatedWebURL(metadata.url),
        title: metadata.title.map(cleanedTitle)
      )
    }
    if let data = item as? Data {
      if let image = UIImage(data: data) {
        capturePreviewImage(image)
        return CompactLoadedSharePayload()
      }
      if let metadata = try? NSKeyedUnarchiver.unarchivedObject(
        ofClass: LPLinkMetadata.self,
        from: data
      ) {
        return decodeSharePayload(metadata)
      }
      if let propertyList = try? PropertyListSerialization.propertyList(
        from: data,
        options: [],
        format: nil
      ) {
        return decodeSharePayload(propertyList)
      }
      if let value = String(data: data, encoding: .utf8) {
        return decodeSharePayload(value)
      }
    }
    guard let dictionary = stringDictionary(item) else {
      return CompactLoadedSharePayload()
    }
    let wrapped = stringDictionary(dictionary[NSExtensionJavaScriptPreprocessingResultsKey])
    let values = wrapped ?? dictionary
    let url = dictionaryURL(in: values, keys: ["url", "canonicalURL", "shareURL", "baseURI"])
    let title = dictionaryString(in: values, keys: ["pageTitle", "title", "name"])
    let isPageCapture = wrapped != nil
      || dictionaryBool(in: values, key: "safariPageCapture")
      || values["pageEvidence"] != nil
    return CompactLoadedSharePayload(
      url: url,
      title: title,
      preprocessedValues: isPageCapture ? values : nil
    )
  }

  private func capturePreviewImage(from provider: NSItemProvider?) {
    guard let provider else { return }
    if provider.canLoadObject(ofClass: UIImage.self) {
      provider.loadObject(ofClass: UIImage.self) { [weak self] object, _ in
        guard let image = object as? UIImage else { return }
        self?.capturePreviewImage(image)
      }
      return
    }
    guard provider.hasItemConformingToTypeIdentifier(UTType.image.identifier) else {
      return
    }
    provider.loadDataRepresentation(forTypeIdentifier: UTType.image.identifier) {
      [weak self] data, _ in
      guard let data, let image = UIImage(data: data) else { return }
      self?.capturePreviewImage(image)
    }
  }

  private func capturePreviewImage(_ image: UIImage) {
    DispatchQueue.main.async { [weak self] in
      guard let self, self.sharedPreviewImageData == nil,
            let data = self.normalizedPreviewJPEG(from: image)
      else { return }
      self.sharedPreviewImageData = data
      if let importID = self.queuedImportIDForPreview {
        Task.detached(priority: .userInitiated) {
          HomeboardSharedImportStore.savePreviewImage(data, for: importID)
        }
      }
    }
  }

  private func previewImageDataBeforeDismissal() async -> Data? {
    if let sharedPreviewImageData { return sharedPreviewImageData }
    // LinkPresentation thumbnails can arrive a beat after the URL and unit
    // facts. Give that local provider a short window without doing network
    // work or making the save sheet feel stuck.
    for _ in 0..<6 {
      try? await Task.sleep(nanoseconds: 75_000_000)
      if let sharedPreviewImageData { return sharedPreviewImageData }
    }
    return nil
  }

  private func normalizedPreviewJPEG(from image: UIImage) -> Data? {
    guard image.size.width > 0, image.size.height > 0 else { return nil }
    let maximumDimension: CGFloat = 1_600
    let longestSide = max(image.size.width, image.size.height)
    let scale = min(1, maximumDimension / longestSide)
    let size = CGSize(
      width: max(1, (image.size.width * scale).rounded()),
      height: max(1, (image.size.height * scale).rounded())
    )
    let format = UIGraphicsImageRendererFormat()
    format.scale = 1
    format.opaque = true
    let normalized = UIGraphicsImageRenderer(size: size, format: format).image { context in
      context.cgContext.setFillColor(UIColor.black.cgColor)
      context.cgContext.fill(CGRect(origin: .zero, size: size))
      image.draw(in: CGRect(origin: .zero, size: size))
    }
    for quality in [0.82, 0.68, 0.52, 0.38] as [CGFloat] {
      if let data = normalized.jpegData(compressionQuality: quality),
         data.count <= 2_000_000
      {
        return data
      }
    }
    return nil
  }

  private func resolve(_ payload: CompactLoadedSharePayload) {
    sharedURL = payload.url
    sharedTitle = payload.title
    usesSafariFinalize = payload.preprocessedValues != nil
    guard let url = payload.url else {
      showFailure("Homeboard needs the listing link from this app.")
      return
    }

    if let values = payload.preprocessedValues,
       values["pageEvidence"] != nil || values["address"] != nil
    {
      var prepared = values
      prepared["url"] = dictionaryString(in: values, keys: ["url"])
        ?? url.absoluteString
      prepared["sourceName"] = providerName(url.host)
      if prepared["pageTitle"] == nil { prepared["pageTitle"] = payload.title }
      beginAnalysis(prepared)
      return
    }

    extractedValues = [
      "url": url.absoluteString,
      "canonicalURL": url.absoluteString
    ]
    if let sourceName = providerName(url.host) {
      extractedValues["sourceName"] = sourceName
    }
    if let pageTitle = payload.title {
      extractedValues["pageTitle"] = pageTitle
    }
    statusLabel.text = "Scanning the listing…"
    addressLabel.text = providerName(url.host) ?? url.host ?? "Shared listing"
    startFastZillowSnapshot(for: url, fallbackTitle: payload.title)
    var request = URLRequest(
      url: url,
      cachePolicy: .reloadRevalidatingCacheData,
      timeoutInterval: 15
    )
    request.setValue("en-US,en;q=0.9", forHTTPHeaderField: "Accept-Language")
    webView.load(request)

    let timeout = DispatchWorkItem { [weak self] in
      guard let self, !self.hasStartedPageExtraction else { return }
      self.extractLoadedPage()
    }
    navigationTimeout = timeout
    DispatchQueue.main.asyncAfter(deadline: .now() + 9, execute: timeout)
  }

  private func startFastZillowSnapshot(for url: URL, fallbackTitle: String?) {
    snapshotTask = Task { [weak self] in
      guard let snapshot = await CompactZillowSnapshotLoader.load(
        url: url,
        fallbackTitle: fallbackTitle
      ), !Task.isCancelled else { return }
      await MainActor.run {
        guard let self, !self.hasStartedModelAnalysis, !self.hasFinished else { return }
        _ = HomeboardShareBootDiagnosticStore.append(
          stage: "compact.snapshot.ready",
          detail: "Zillow embedded data supplied \(snapshot.unitCount) complete units"
        )
        let isShowingPendingChoices = self.showPendingSnapshot(snapshot)
        if snapshot.values["imageURL"] != nil {
          self.beginAnalysis(
            snapshot.values,
            preservingPendingChoices: isShowingPendingChoices
          )
        } else {
          // Keep the exact Zillow unit rows, but leave the web view alive long
          // enough to recover the page's Open Graph/visible preview image.
          self.statusLabel.text = "Confirming the homes and photo…"
        }
      }
    }
  }

  private func extractLoadedPage() {
    guard !hasStartedPageExtraction else { return }
    hasStartedPageExtraction = true
    navigationTimeout?.cancel()
    statusLabel.text = "Finding the available homes…"

    analysisTask = Task { @MainActor [weak self] in
      guard let self else { return }
      var best = await self.evaluatePageExtraction()
      await self.primeLazyPageContent()
      try? await Task.sleep(for: .milliseconds(350))
      if let second = await self.evaluatePageExtraction() {
        let firstImageURL = best?["imageURL"]
        if self.extractionScore(second) >= self.extractionScore(best) {
          best = second
        }
        if best?["imageURL"] == nil,
           let recoveredImageURL = firstImageURL ?? second["imageURL"]
        {
          best?["imageURL"] = recoveredImageURL
        }
      }
      var values = self.extractedValues
      let snapshotUnitKeys = Set([
        "unitOptions",
        "structuredUnitEvidence",
        "availabilityPageEvidence",
        "primaryPageEvidence",
        "pageEvidence"
      ])
      let hasSnapshotUnits = (values["unitOptions"] as? [Any])?.isEmpty == false
      for (key, value) in best ?? [:] {
        if hasSnapshotUnits, snapshotUnitKeys.contains(key) { continue }
        values[key] = value
      }
      values["url"] = self.sharedURL?.absoluteString
      values["sourceName"] = self.providerName(self.sharedURL?.host)
      if values["pageTitle"] == nil { values["pageTitle"] = self.sharedTitle }
      self.beginAnalysis(values)
    }
  }

  @MainActor
  private func evaluatePageExtraction() async -> [String: Any]? {
    guard let resourceURL = Bundle.main.url(
      forResource: "SharePreprocessor",
      withExtension: "js"
    ), let source = try? String(contentsOf: resourceURL, encoding: .utf8)
    else { return nil }
    let script = source + """

    ;var __homeboardCompactPayload = null;
    ExtensionPreprocessingJS.run({completionFunction: function(value) {
      __homeboardCompactPayload = value;
    }});
    __homeboardCompactPayload;
    """
    return await withCheckedContinuation { continuation in
      webView.evaluateJavaScript(script) { [weak self] result, _ in
        continuation.resume(returning: self?.stringDictionary(result))
      }
    }
  }

  @MainActor
  private func primeLazyPageContent() async {
    await withCheckedContinuation { continuation in
      webView.evaluateJavaScript(
        "window.scrollTo(0, Math.max(document.body.scrollHeight, document.documentElement.scrollHeight)); true;"
      ) { _, _ in
        continuation.resume()
      }
    }
  }

  private func extractionScore(_ values: [String: Any]?) -> Int {
    guard let values else { return 0 }
    let core = ["address", "price", "bedrooms", "bathrooms"]
      .filter { values[$0] != nil }
      .count
    let options = (values["unitOptions"] as? [Any])?.count ?? 0
    let evidence = (values["pageEvidence"] as? String)?.count ?? 0
    return core * 100 + options * 20 + min(evidence / 250, 40)
  }

  private func beginAnalysis(
    _ values: [String: Any],
    preservingPendingChoices: Bool = false
  ) {
    guard !hasStartedModelAnalysis, !hasFinished else { return }
    hasStartedModelAnalysis = true
    hasStartedPageExtraction = true
    navigationTimeout?.cancel()
    navigationTimeout = nil
    snapshotTask?.cancel()
    webView.stopLoading()
    extractedValues = values.compactMapValues { $0 }
    if !preservingPendingChoices {
      statusLabel.text = "Organizing the details…"
      addressLabel.text = "One quick pass before you choose."
    }
    analysisTask?.cancel()
    analysisTask = Task { [weak self] in
      let result = await HomeboardListingIntelligence.analyzeWithOneRescan(
        message: values,
        allowSystemModel: true
      )
      guard !Task.isCancelled else { return }
      await MainActor.run {
        guard let self, !self.hasFinished else { return }
        self.show(result.analysis)
      }
    }
  }

  @discardableResult
  private func showPendingSnapshot(_ snapshot: CompactZillowSnapshot) -> Bool {
    let pendingChoices = provisionalChoices(from: snapshot.values)
    guard
      !pendingChoices.isEmpty,
      pendingChoices.count == snapshot.unitCount
    else { return false }

    extractedValues = snapshot.values.compactMapValues { $0 }
    items = pendingChoices.map(CompactShareItem.listing)
    collectionView.reloadData()
    collectionView.isHidden = false
    choicesContainer.isHidden = false
    editContainer.isHidden = true
    choicesBottomConstraint?.isActive = true
    preferredContentSize = CGSize(width: max(view.bounds.width, 390), height: 720)
    loadingView.stopAnimating()
    statusLabel.text = snapshot.unitCount == 1
      ? "Confirming this home…"
      : "Confirming \(snapshot.unitCount) homes…"
    addressLabel.text = dictionaryString(
      in: snapshot.values,
      keys: ["address", "pageTitle"]
    ) ?? sharedURL?.host ?? "Shared listing"
    return true
  }

  private func provisionalChoices(
    from values: [String: Any]
  ) -> [CompactListingChoice] {
    let rawOptions = values["unitOptions"] as? [Any] ?? []
    return rawOptions.compactMap { rawOption in
      guard
        let option = stringDictionary(rawOption),
        let unit = dictionaryString(in: option, keys: ["unit", "label"])
      else { return nil }
      return CompactListingChoice(
        title: compactOptionTitle(nil, fallbackUnit: unit),
        subtitle: "",
        price: nil,
        pendingImport: nil,
        isConfirmed: false
      )
    }
  }

  private func show(_ analysis: HomeboardListingAnalysis) {
    self.analysis = analysis
    loadingView.stopAnimating()
    addressLabel.text = analysis.facts.address
      ?? dictionaryString(in: extractedValues, keys: ["address", "pageTitle"])
      ?? sharedURL?.host
      ?? "Shared listing"

    let listingChoices = makeChoices(from: analysis)
    items = listingChoices.map(CompactShareItem.listing) + [.edit]
    collectionView.reloadData()
    collectionView.isHidden = false
    choicesContainer.isHidden = false
    editContainer.isHidden = true
    choicesBottomConstraint?.isActive = true
    preferredContentSize = CGSize(width: max(view.bounds.width, 390), height: 720)

    if listingChoices.count > 1 {
      statusLabel.text = "Choose one of \(listingChoices.count) homes"
    } else if listingChoices.count == 1, !analysis.options.isEmpty {
      statusLabel.text = "Choose the home to save"
    } else if listingChoices.isEmpty {
      statusLabel.text = "A few details need you"
    } else {
      statusLabel.text = "Tap to save this home"
    }
  }

  private func makeChoices(from analysis: HomeboardListingAnalysis) -> [CompactListingChoice] {
    if !analysis.options.isEmpty {
      return analysis.options.compactMap { option in
        makeChoice(facts: analysis.facts, option: option, isMultiple: true)
      }
    }
    guard let choice = makeChoice(
      facts: analysis.facts,
      option: nil,
      isMultiple: false
    ) else { return [] }
    return [choice]
  }

  private func makeChoice(
    facts: HomeboardListingFacts,
    option: HomeboardUnitOption?,
    isMultiple: Bool
  ) -> CompactListingChoice? {
    let address = cleaned(facts.address)
      ?? dictionaryString(in: extractedValues, keys: ["address"])
    let unit = cleaned(option?.unit) ?? cleaned(facts.unit)
    let price = option?.price ?? facts.price
    let bedrooms = option?.bedrooms ?? facts.bedrooms
    let bathrooms = option?.bathrooms ?? facts.bathrooms
    let squareFeet = option?.squareFeet ?? facts.squareFeet
    guard address != nil, price != nil, bedrooms != nil, bathrooms != nil else { return nil }

    let pending = makePendingImport(
      address: address,
      unit: unit,
      price: price,
      bedrooms: bedrooms,
      bathrooms: bathrooms,
      squareFeet: squareFeet,
      availableDate: option?.availableDate
        ?? dictionaryString(in: extractedValues, keys: ["availableDate"]),
      confidence: "pill-confirmed"
    )
    guard let pending else { return nil }
    let title = isMultiple
      ? compactOptionTitle(option, fallbackUnit: unit)
      : compactSingleTitle(address: address, unit: unit)
    let primaryDetails = [
      bedrooms.map { "\(displayNumber($0)) bed" },
      bathrooms.map { "\(displayNumber($0)) bath" },
      squareFeet.map { "\($0.formatted()) sq ft" }
    ].compactMap { $0 }.joined(separator: "  ·  ")
    let subtitle = [
      primaryDetails.isEmpty ? nil : primaryDetails,
      option?.availableDate.map { "Available \($0)" }
    ].compactMap { $0 }.joined(separator: "\n")
    return CompactListingChoice(
      title: title,
      subtitle: subtitle,
      price: price.map { "$\(Int($0.rounded()).formatted())" },
      pendingImport: pending,
      isConfirmed: true
    )
  }

  private func makePendingImport(
    address: String?,
    unit: String?,
    price: Double?,
    bedrooms: Double?,
    bathrooms: Double?,
    squareFeet: Int?,
    availableDate: String?,
    confidence: String
  ) -> HomeboardSharedImportStore.PendingImport? {
    guard let sharedURL else { return nil }
    return HomeboardSharedImportStore.PendingImport(
      url: sharedURL.absoluteString,
      canonicalURL: dictionaryString(in: extractedValues, keys: ["canonicalURL"]),
      boardId: HomeboardSharedImportStore.activeBoardId,
      sourceName: dictionaryString(in: extractedValues, keys: ["sourceName"])
        ?? providerName(sharedURL.host),
      pageTitle: dictionaryString(in: extractedValues, keys: ["pageTitle"])
        ?? sharedTitle,
      address: cleaned(address),
      unit: cleaned(unit)?.uppercased(),
      city: dictionaryString(in: extractedValues, keys: ["city"]),
      neighborhood: cleaned(analysis?.facts.neighborhood)
        ?? dictionaryString(in: extractedValues, keys: ["neighborhood"]),
      latitude: dictionaryNumber(in: extractedValues, key: "latitude"),
      longitude: dictionaryNumber(in: extractedValues, key: "longitude"),
      price: price,
      bedrooms: bedrooms,
      bathrooms: bathrooms,
      squareFeet: squareFeet,
      availableDate: cleaned(availableDate),
      imageURL: cleaned(analysis?.facts.imageURL)
        ?? dictionaryString(in: extractedValues, keys: ["imageURL"]),
      summary: cleaned(analysis?.facts.summary)
        ?? dictionaryString(in: extractedValues, keys: ["summary"]),
      amenities: analysis?.facts.amenities
        ?? (extractedValues["amenities"] as? [String] ?? []),
      modelInsights: analysis?.facts.insights ?? [],
      listingScope: "unit",
      extractionConfidence: confidence
    )
  }

  private func compactOptionTitle(
    _ option: HomeboardUnitOption?,
    fallbackUnit: String?
  ) -> String {
    if let unit = cleaned(option?.unit) ?? cleaned(fallbackUnit) {
      let normalized = unit.replacingOccurrences(
        of: #"^(?:unit|apt\.?|apartment|#)\s*"#,
        with: "",
        options: [.regularExpression, .caseInsensitive]
      )
      return "Unit \(normalized)"
    }
    return cleaned(option?.label) ?? "Available home"
  }

  private func compactSingleTitle(address: String?, unit: String?) -> String {
    let street = cleaned(address)?.components(separatedBy: ",").first
      ?? "This listing"
    guard let unit = cleaned(unit), !street.localizedCaseInsensitiveContains(unit) else {
      return street
    }
    return "\(street) · \(compactOptionTitle(nil, fallbackUnit: unit))"
  }

  private func showEditForm() {
    let facts = analysis?.facts
    addressField.text = cleaned(facts?.address)
      ?? dictionaryString(in: extractedValues, keys: ["address"])
    unitField.text = cleaned(facts?.unit)
      ?? dictionaryString(in: extractedValues, keys: ["unit"])
    priceField.text = (facts?.price ?? dictionaryNumber(in: extractedValues, key: "price"))
      .map { "$\(displayNumber($0))" }
    bedroomsField.text = (facts?.bedrooms
      ?? dictionaryNumber(in: extractedValues, key: "bedrooms"))
      .map(displayNumber)
    bathroomsField.text = (facts?.bathrooms
      ?? dictionaryNumber(in: extractedValues, key: "bathrooms"))
      .map(displayNumber)
    editStatusLabel.isHidden = true
    choicesBottomConstraint?.isActive = false
    choicesContainer.isHidden = true
    editContainer.isHidden = false
    statusLabel.text = "Edit the place details"
    addressLabel.text = "Address, rent, beds, and baths are required."
    preferredContentSize = CGSize(width: max(view.bounds.width, 390), height: 720)
  }

  @objc private func hideEditForm() {
    view.endEditing(true)
    editContainer.isHidden = true
    choicesContainer.isHidden = false
    choicesBottomConstraint?.isActive = true
    if let analysis { show(analysis) }
  }

  @objc private func saveEditedDetails() {
    let address = cleaned(addressField.text)
    let price = numeric(priceField.text)
    let bedrooms = numeric(bedroomsField.text)
    let bathrooms = numeric(bathroomsField.text)
    guard address != nil, price != nil, bedrooms != nil, bathrooms != nil else {
      editStatusLabel.text = "Add the address, rent, beds, and baths first."
      editStatusLabel.isHidden = false
      return
    }
    let pending = makePendingImport(
      address: address,
      unit: cleaned(unitField.text),
      price: price,
      bedrooms: bedrooms,
      bathrooms: bathrooms,
      squareFeet: analysis?.facts.squareFeet,
      availableDate: dictionaryString(in: extractedValues, keys: ["availableDate"]),
      confidence: "manually-reviewed"
    )
    guard let pending else {
      editStatusLabel.text = "The listing link is missing. Share it again from the app."
      editStatusLabel.isHidden = false
      return
    }
    save(pending)
  }

  private func save(_ pending: HomeboardSharedImportStore.PendingImport) {
    guard !hasFinished else { return }
    view.endEditing(true)
    collectionView.isUserInteractionEnabled = false
    editSaveButton.isEnabled = false
    loadingView.startAnimating()
    statusLabel.text = "Saving to Homeboard…"
    addressLabel.text = compactSavedSummary(pending)

    Task { @MainActor [weak self] in
      guard let self else { return }
      let receipt = await HomeboardListingSavePipeline.enqueue(pending)
      guard receipt.savedLocally else {
        self.loadingView.stopAnimating()
        self.statusLabel.text = "Couldn’t save this one"
        self.addressLabel.text = "Open Homeboard once, then try this share again."
        self.addressLabel.textColor = CompactSharePalette.danger
        self.collectionView.isUserInteractionEnabled = true
        self.editSaveButton.isEnabled = true
        return
      }

      self.queuedImportIDForPreview = receipt.listing.id
      if let previewData = await self.previewImageDataBeforeDismissal() {
        _ = await Task.detached(priority: .userInitiated) {
          HomeboardSharedImportStore.savePreviewImage(
            previewData,
            for: receipt.listing.id
          )
        }.value
      }

      self.showSaved(message: "Saved to Homeboard")
      Task.detached(priority: .background) {
        _ = HomeboardShareBootDiagnosticStore.append(
          stage: "compact.save.queued",
          detail: "Listing is durable; the main app will sync it after the extension closes"
        )
      }
    }
  }

  private func showSaved(message: String) {
    guard !hasFinished else { return }
    hasFinished = true
    loadingView.stopAnimating()
    brandLabel.text = "HOMEBOARD"
    statusLabel.text = message
    addressLabel.textColor = CompactSharePalette.secondaryText.withAlphaComponent(0.82)
    choicesBottomConstraint?.isActive = false
    choicesContainer.isHidden = true
    editContainer.isHidden = true
    analysisTask?.cancel()
    analysisTask = nil
    snapshotTask?.cancel()
    snapshotTask = nil
    navigationTimeout?.cancel()
    navigationTimeout = nil
    webView.stopLoading()
    webView.navigationDelegate = nil
    DispatchQueue.main.asyncAfter(deadline: .now() + 0.9) { [weak self] in
      self?.completeRequest()
    }
  }

  private func compactSavedSummary(
    _ pending: HomeboardSharedImportStore.PendingImport
  ) -> String {
    [
      pending.unit.map { "Unit \($0)" },
      pending.price.map { "$\(Int($0.rounded()).formatted())" },
      pending.bedrooms.map { "\(displayNumber($0)) bed" },
      pending.bathrooms.map { "\(displayNumber($0)) bath" }
    ].compactMap { $0 }.joined(separator: " · ")
  }

  private func showFailure(_ message: String) {
    loadingView.stopAnimating()
    statusLabel.text = "Couldn’t read this listing"
    addressLabel.text = message
    addressLabel.textColor = CompactSharePalette.danger
    items = [.edit]
    collectionView.reloadData()
    collectionView.isHidden = false
    choicesContainer.isHidden = false
    editContainer.isHidden = true
    choicesBottomConstraint?.isActive = true
  }

  private func completeRequest() {
    guard usesSafariFinalize else {
      extensionContext?.completeRequest(returningItems: [], completionHandler: nil)
      return
    }
    let propertyList = [
      NSExtensionJavaScriptFinalizeArgumentKey: ["cleanup": true] as NSDictionary
    ] as NSDictionary
    let provider = NSItemProvider(
      item: propertyList,
      typeIdentifier: UTType.propertyList.identifier
    )
    let item = NSExtensionItem()
    item.attachments = [provider]
    extensionContext?.completeRequest(returningItems: [item], completionHandler: nil)
  }

  private func stringDictionary(_ item: Any?) -> [String: Any]? {
    if let values = item as? [String: Any] { return values }
    guard let values = item as? NSDictionary else { return nil }
    var result: [String: Any] = [:]
    for (key, value) in values {
      if let key = key as? String { result[key] = value }
    }
    return result
  }

  private func dictionaryString(
    in values: [String: Any],
    keys: [String]
  ) -> String? {
    for key in keys {
      if let value = values[key] as? String,
         let cleaned = cleaned(value)
      {
        return cleaned
      }
      if let value = values[key] as? URL { return value.absoluteString }
    }
    return nil
  }

  private func dictionaryURL(
    in values: [String: Any],
    keys: [String]
  ) -> URL? {
    for key in keys {
      if let value = values[key] as? URL,
         let valid = validatedWebURL(value)
      {
        return valid
      }
      if let value = values[key] as? String,
         let valid = firstWebURL(in: value) ?? validatedWebURL(URL(string: value))
      {
        return valid
      }
    }
    return nil
  }

  private func dictionaryBool(in values: [String: Any], key: String) -> Bool {
    (values[key] as? Bool) ?? (values[key] as? NSNumber)?.boolValue ?? false
  }

  private func dictionaryNumber(in values: [String: Any], key: String) -> Double? {
    if let value = values[key] as? NSNumber { return value.doubleValue }
    return numeric(values[key] as? String)
  }

  private func firstWebURL(in value: String) -> URL? {
    let range = NSRange(value.startIndex..<value.endIndex, in: value)
    guard let detector = try? NSDataDetector(
      types: NSTextCheckingResult.CheckingType.link.rawValue
    ) else { return nil }
    for match in detector.matches(in: value, options: [], range: range) {
      if let url = validatedWebURL(match.url) { return url }
    }
    return nil
  }

  private func validatedWebURL(_ url: URL?) -> URL? {
    guard let url, ["http", "https"].contains(url.scheme?.lowercased() ?? "") else {
      return nil
    }
    return url
  }

  private func cleaned(_ value: String?) -> String? {
    guard let value else { return nil }
    let result = value
      .replacingOccurrences(of: #"\s+"#, with: " ", options: .regularExpression)
      .trimmingCharacters(in: .whitespacesAndNewlines)
    return result.isEmpty ? nil : result
  }

  private func cleanedTitle(_ value: String) -> String {
    let withoutURL = value.replacingOccurrences(
      of: #"https?://\S+"#,
      with: "",
      options: [.regularExpression, .caseInsensitive]
    )
    return cleaned(withoutURL) ?? ""
  }

  private func numeric(_ value: String?) -> Double? {
    guard let value else { return nil }
    let raw = value.filter { $0.isNumber || $0 == "." }
    return raw.isEmpty ? nil : Double(raw)
  }

  private func displayNumber(_ value: Double) -> String {
    value.rounded() == value
      ? String(Int(value))
      : String(format: "%.1f", value)
  }

  private func providerName(_ host: String?) -> String? {
    guard let host else { return nil }
    let name = host.lowercased()
      .replacingOccurrences(of: "www.", with: "")
      .components(separatedBy: ".")
      .first
    return name?.capitalized
  }
}

extension CompactShareViewController: WKNavigationDelegate {
  func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
    extractLoadedPage()
  }

  func webView(
    _ webView: WKWebView,
    didFail navigation: WKNavigation!,
    withError error: Error
  ) {
    extractLoadedPage()
  }

  func webView(
    _ webView: WKWebView,
    didFailProvisionalNavigation navigation: WKNavigation!,
    withError error: Error
  ) {
    extractLoadedPage()
  }
}

extension CompactShareViewController: UICollectionViewDataSource, UICollectionViewDelegate {
  func collectionView(
    _ collectionView: UICollectionView,
    numberOfItemsInSection section: Int
  ) -> Int {
    items.count
  }

  func collectionView(
    _ collectionView: UICollectionView,
    cellForItemAt indexPath: IndexPath
  ) -> UICollectionViewCell {
    let cell = collectionView.dequeueReusableCell(
      withReuseIdentifier: CompactListingChoiceCell.reuseIdentifier,
      for: indexPath
    ) as! CompactListingChoiceCell
    switch items[indexPath.item] {
    case .listing(let choice):
      cell.configure(
        title: choice.title,
        subtitle: choice.subtitle,
        price: choice.price,
        isEdit: false,
        isLoading: !choice.isConfirmed
      )
    case .edit:
      cell.configure(
        title: "Edit details",
        subtitle: "Fix or add anything Homeboard missed",
        price: nil,
        isEdit: true,
        isLoading: false
      )
    }
    return cell
  }

  func collectionView(_ collectionView: UICollectionView, didSelectItemAt indexPath: IndexPath) {
    switch items[indexPath.item] {
    case .listing(let choice):
      guard choice.isConfirmed, let pendingImport = choice.pendingImport else {
        collectionView.deselectItem(at: indexPath, animated: true)
        statusLabel.text = "Still confirming this home…"
        return
      }
      save(pendingImport)
    case .edit:
      showEditForm()
    }
  }
}

private final class CompactListingChoiceCell: UICollectionViewCell {
  static let reuseIdentifier = "CompactListingChoiceCell"

  private let iconView = UIImageView()
  private let titleLabel = UILabel()
  private let subtitleLabel = UILabel()
  private let priceLabel = UILabel()
  private let loadingFieldsStack = UIStackView()
  private let priceLoadingStack = UIStackView()
  private let bedroomsLoadingView = UIActivityIndicatorView(style: .medium)
  private let bathroomsLoadingView = UIActivityIndicatorView(style: .medium)
  private let squareFeetLoadingView = UIActivityIndicatorView(style: .medium)
  private let priceLoadingView = UIActivityIndicatorView(style: .medium)

  override init(frame: CGRect) {
    super.init(frame: frame)
    contentView.layer.cornerRadius = 28
    contentView.layer.borderWidth = 1
    contentView.layer.masksToBounds = true

    iconView.contentMode = .scaleAspectFit
    iconView.tintColor = CompactSharePalette.accent
    iconView.translatesAutoresizingMaskIntoConstraints = false
    NSLayoutConstraint.activate([
      iconView.widthAnchor.constraint(equalToConstant: 22),
      iconView.heightAnchor.constraint(equalToConstant: 22)
    ])

    titleLabel.textColor = CompactSharePalette.primaryText
    titleLabel.font = .systemFont(ofSize: 15, weight: .bold)
    titleLabel.numberOfLines = 1
    titleLabel.lineBreakMode = .byTruncatingTail

    subtitleLabel.textColor = CompactSharePalette.secondaryText.withAlphaComponent(0.84)
    subtitleLabel.font = .systemFont(ofSize: 11, weight: .semibold)
    subtitleLabel.numberOfLines = 2
    subtitleLabel.lineBreakMode = .byTruncatingTail

    priceLabel.textColor = CompactSharePalette.accent
    priceLabel.font = .systemFont(ofSize: 16, weight: .heavy)
    priceLabel.textAlignment = .right
    priceLabel.setContentCompressionResistancePriority(.required, for: .horizontal)

    loadingFieldsStack.axis = .horizontal
    loadingFieldsStack.alignment = .center
    loadingFieldsStack.spacing = 9
    loadingFieldsStack.addArrangedSubview(Self.makeLoadingField(
      title: "bed",
      indicator: bedroomsLoadingView
    ))
    loadingFieldsStack.addArrangedSubview(Self.makeLoadingField(
      title: "bath",
      indicator: bathroomsLoadingView
    ))
    loadingFieldsStack.addArrangedSubview(Self.makeLoadingField(
      title: "sq ft",
      indicator: squareFeetLoadingView
    ))

    priceLoadingStack.axis = .horizontal
    priceLoadingStack.alignment = .center
    priceLoadingStack.spacing = 4
    priceLoadingStack.addArrangedSubview(priceLoadingView)
    let rentLoadingLabel = UILabel()
    rentLoadingLabel.text = "rent"
    rentLoadingLabel.textColor = CompactSharePalette.secondaryText.withAlphaComponent(0.84)
    rentLoadingLabel.font = .systemFont(ofSize: 10, weight: .semibold)
    priceLoadingStack.addArrangedSubview(rentLoadingLabel)
    Self.configureLoadingIndicator(priceLoadingView)
    priceLoadingStack.setContentCompressionResistancePriority(.required, for: .horizontal)

    let copy = UIStackView(arrangedSubviews: [
      titleLabel,
      subtitleLabel,
      loadingFieldsStack
    ])
    copy.axis = .vertical
    copy.spacing = 4
    let row = UIStackView(arrangedSubviews: [
      iconView,
      copy,
      priceLabel,
      priceLoadingStack
    ])
    row.axis = .horizontal
    row.alignment = .center
    row.spacing = 10
    row.translatesAutoresizingMaskIntoConstraints = false
    contentView.addSubview(row)
    NSLayoutConstraint.activate([
      row.leadingAnchor.constraint(equalTo: contentView.leadingAnchor, constant: 17),
      row.trailingAnchor.constraint(equalTo: contentView.trailingAnchor, constant: -17),
      row.topAnchor.constraint(equalTo: contentView.topAnchor, constant: 14),
      row.bottomAnchor.constraint(equalTo: contentView.bottomAnchor, constant: -14)
    ])
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) {
    fatalError("init(coder:) has not been implemented")
  }

  override var isHighlighted: Bool {
    didSet {
      UIView.animate(withDuration: 0.12) {
        self.contentView.transform = self.isHighlighted
          ? CGAffineTransform(scaleX: 0.975, y: 0.975)
          : .identity
        self.contentView.alpha = self.isHighlighted ? 0.88 : 1
      }
    }
  }

  func configure(
    title: String,
    subtitle: String,
    price: String?,
    isEdit: Bool,
    isLoading: Bool
  ) {
    titleLabel.text = title
    subtitleLabel.text = subtitle
    priceLabel.text = price
    subtitleLabel.isHidden = isLoading
    loadingFieldsStack.isHidden = !isLoading
    priceLabel.isHidden = isLoading || price == nil
    priceLoadingStack.isHidden = !isLoading
    let loadingViews = [
      bedroomsLoadingView,
      bathroomsLoadingView,
      squareFeetLoadingView,
      priceLoadingView
    ]
    for loadingView in loadingViews {
      if isLoading {
        loadingView.startAnimating()
      } else {
        loadingView.stopAnimating()
      }
    }
    iconView.image = UIImage(systemName: isEdit ? "slider.horizontal.3" : "house.fill")
    contentView.backgroundColor = isEdit
      ? CompactSharePalette.surface
      : CompactSharePalette.surface.withAlphaComponent(0.98)
    contentView.layer.borderColor = (isEdit
      ? CompactSharePalette.border.withAlphaComponent(0.38)
      : CompactSharePalette.accent.withAlphaComponent(0.58)).cgColor
  }

  private static func makeLoadingField(
    title: String,
    indicator: UIActivityIndicatorView
  ) -> UIStackView {
    configureLoadingIndicator(indicator)
    let label = UILabel()
    label.text = title
    label.textColor = CompactSharePalette.secondaryText.withAlphaComponent(0.84)
    label.font = .systemFont(ofSize: 10, weight: .semibold)
    let stack = UIStackView(arrangedSubviews: [indicator, label])
    stack.axis = .horizontal
    stack.alignment = .center
    stack.spacing = 2
    return stack
  }

  private static func configureLoadingIndicator(_ indicator: UIActivityIndicatorView) {
    indicator.color = CompactSharePalette.accent
    indicator.hidesWhenStopped = true
    indicator.transform = CGAffineTransform(scaleX: 0.66, y: 0.66)
    indicator.translatesAutoresizingMaskIntoConstraints = false
    indicator.widthAnchor.constraint(equalToConstant: 14).isActive = true
    indicator.heightAnchor.constraint(equalToConstant: 14).isActive = true
  }
}
