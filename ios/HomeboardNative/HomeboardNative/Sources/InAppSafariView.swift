import SafariServices
import SwiftUI

struct InAppSafariView: UIViewControllerRepresentable {
  let url: URL

  func makeUIViewController(context: Context) -> SFSafariViewController {
    let controller = SFSafariViewController(url: url)
    controller.preferredControlTintColor = UIColor(HomeboardPalette.accent)
    controller.dismissButtonStyle = .close
    return controller
  }

  func updateUIViewController(
    _ uiViewController: SFSafariViewController,
    context: Context
  ) {}
}
