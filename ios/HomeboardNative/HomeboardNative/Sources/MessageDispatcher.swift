import Foundation
import MessageUI
import UIKit

/// Result of a message or email dispatch attempt.
public enum MessageDispatchResult: Equatable, Sendable {
  case sent
  case cancelled
  case failed(String?)

  public static var failed: MessageDispatchResult {
    .failed(nil)
  }
}

/// A self-contained utility for presenting mail and SMS/iMessage compose controllers
/// and receiving completion callbacks.
@MainActor
public final class MessageDispatcher: NSObject {
  public static let shared = MessageDispatcher()

  /// Whether the current device is configured to send email.
  public static var canSendMail: Bool {
    MFMailComposeViewController.canSendMail()
  }

  /// Whether the current device can send text messages.
  public static var canSendText: Bool {
    MFMessageComposeViewController.canSendText()
  }

  /// Active dispatch coordinators retained while compose view controllers are presented.
  private var activeCoordinators: [UUID: Coordinator] = [:]

  private override init() {
    super.init()
  }

  // MARK: - Presentation API

  /// Presents an MFMailComposeViewController.
  /// - Parameters:
  ///   - recipients: Destination email addresses.
  ///   - subject: Email subject line.
  ///   - body: Plain-text email body.
  ///   - presentingViewController: Optional controller to present from; if nil, the top-most view controller is used.
  ///   - completion: Callback invoked with the final dispatch result.
  public func presentMail(
    recipients: [String],
    subject: String,
    body: String,
    from presentingViewController: UIViewController? = nil,
    completion: @escaping (MessageDispatchResult) -> Void
  ) {
    guard Self.canSendMail else {
      completion(.failed("Device is not configured to send mail."))
      return
    }

    guard let presenter = presentingViewController ?? Self.topViewController() else {
      completion(.failed("No active view controller available to present mail."))
      return
    }

    let coordinatorId = UUID()
    let composer = MFMailComposeViewController()
    composer.setToRecipients(recipients)
    composer.setSubject(subject)
    composer.setMessageBody(body, isHTML: false)

    let coordinator = Coordinator(id: coordinatorId) { [weak self] result in
      self?.activeCoordinators.removeValue(forKey: coordinatorId)
      completion(result)
    }

    composer.mailComposeDelegate = coordinator
    activeCoordinators[coordinatorId] = coordinator

    presenter.present(composer, animated: true)
  }

  /// Presents an MFMessageComposeViewController.
  /// - Parameters:
  ///   - recipients: Destination phone numbers or contact identifiers.
  ///   - body: Plain-text SMS or iMessage body.
  ///   - presentingViewController: Optional controller to present from; if nil, the top-most view controller is used.
  ///   - completion: Callback invoked with the final dispatch result.
  public func presentMessage(
    recipients: [String],
    body: String,
    from presentingViewController: UIViewController? = nil,
    completion: @escaping (MessageDispatchResult) -> Void
  ) {
    guard Self.canSendText else {
      completion(.failed("Device cannot send text messages."))
      return
    }

    guard let presenter = presentingViewController ?? Self.topViewController() else {
      completion(.failed("No active view controller available to present message."))
      return
    }

    let coordinatorId = UUID()
    let composer = MFMessageComposeViewController()
    composer.recipients = recipients
    composer.body = body

    let coordinator = Coordinator(id: coordinatorId) { [weak self] result in
      self?.activeCoordinators.removeValue(forKey: coordinatorId)
      completion(result)
    }

    composer.messageComposeDelegate = coordinator
    activeCoordinators[coordinatorId] = coordinator

    presenter.present(composer, animated: true)
  }

  // MARK: - Static Convenience Methods

  public static func presentMail(
    recipients: [String],
    subject: String,
    body: String,
    from presentingViewController: UIViewController? = nil,
    completion: @escaping (MessageDispatchResult) -> Void
  ) {
    shared.presentMail(
      recipients: recipients,
      subject: subject,
      body: body,
      from: presentingViewController,
      completion: completion
    )
  }

  public static func presentMessage(
    recipients: [String],
    body: String,
    from presentingViewController: UIViewController? = nil,
    completion: @escaping (MessageDispatchResult) -> Void
  ) {
    shared.presentMessage(
      recipients: recipients,
      body: body,
      from: presentingViewController,
      completion: completion
    )
  }

  // MARK: - View Controller Resolution

  private static func topViewController(base: UIViewController? = nil) -> UIViewController? {
    let baseController: UIViewController? = {
      if let base { return base }
      for scene in UIApplication.shared.connectedScenes {
        guard let windowScene = scene as? UIWindowScene else { continue }
        for window in windowScene.windows where window.isKeyWindow {
          if let root = window.rootViewController {
            return root
          }
        }
      }
      return nil
    }()

    if let nav = baseController as? UINavigationController {
      return topViewController(base: nav.visibleViewController ?? nav.topViewController)
    }
    if let tab = baseController as? UITabBarController {
      return topViewController(base: tab.selectedViewController)
    }
    if let presented = baseController?.presentedViewController, !presented.isBeingDismissed {
      return topViewController(base: presented)
    }
    return baseController
  }

  @MainActor
  private final class Coordinator: NSObject, @preconcurrency MFMailComposeViewControllerDelegate, @preconcurrency MFMessageComposeViewControllerDelegate {
    let id: UUID
    private let onFinish: (MessageDispatchResult) -> Void

    init(id: UUID, onFinish: @escaping (MessageDispatchResult) -> Void) {
      self.id = id
      self.onFinish = onFinish
      super.init()
    }

    // MFMailComposeViewControllerDelegate
    func mailComposeController(
      _ controller: MFMailComposeViewController,
      didFinishWith result: MFMailComposeResult,
      error: Error?
    ) {
      let dispatchResult: MessageDispatchResult
      if let error {
        dispatchResult = .failed(error.localizedDescription)
      } else {
        switch result {
        case .sent:
          dispatchResult = .sent
        case .cancelled, .saved:
          dispatchResult = .cancelled
        case .failed:
          dispatchResult = .failed("Mail delivery failed.")
        @unknown default:
          dispatchResult = .failed(nil)
        }
      }

      controller.dismiss(animated: true) { [onFinish = self.onFinish] in
        onFinish(dispatchResult)
      }
    }

    // MFMessageComposeViewControllerDelegate
    func messageComposeViewController(
      _ controller: MFMessageComposeViewController,
      didFinishWith result: MessageComposeResult
    ) {
      let dispatchResult: MessageDispatchResult
      switch result {
      case .sent:
        dispatchResult = .sent
      case .cancelled:
        dispatchResult = .cancelled
      case .failed:
        dispatchResult = .failed("Message delivery failed.")
      @unknown default:
        dispatchResult = .failed(nil)
      }

      controller.dismiss(animated: true) { [onFinish = self.onFinish] in
        onFinish(dispatchResult)
      }
    }
  }
}
