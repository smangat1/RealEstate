import SafariServices

final class SafariWebExtensionHandler: NSObject, NSExtensionRequestHandling {
  func beginRequest(with context: NSExtensionContext) {
    guard
      let request = context.inputItems.first as? NSExtensionItem,
      let message = request.userInfo?[SFExtensionMessageKey] as? [String: Any]
    else {
      complete(context, message: [
        "saved": false,
        "error": "Homeboard could not read this listing."
      ])
      return
    }

    if message["type"] as? String == "analyzeListing" {
      Task {
        let allowSystemModel = message["allowSystemModel"] as? Bool ?? true
        let scan = await HomeboardListingIntelligence.analyzeWithOneRescan(
          message: message,
          allowSystemModel: allowSystemModel
        )
        complete(context, message: [
          "analyzed": true,
          "analysis": scan.analysis.dictionary
        ])
      }
      return
    }

    if message["type"] as? String == "getContext" {
      Task {
        do {
          let boards = try await HomeboardExtensionSyncClient.fetchBoards()
          var activeBoardId = HomeboardSharedImportStore.activeBoardId
          if !boards.contains(where: { $0.id == activeBoardId }) {
            activeBoardId = boards.first?.id
            HomeboardSharedImportStore.setActiveBoard(activeBoardId)
          }
          complete(context, message: [
            "connected": true,
            "activeBoardId": activeBoardId ?? "",
            "boards": boards.map {
              ["id": $0.id, "title": $0.title, "city": $0.city]
            }
          ])
        } catch {
          complete(context, message: [
            "connected": HomeboardSharedAuthStore.load() != nil,
            "activeBoardId": HomeboardSharedImportStore.activeBoardId ?? "",
            "boards": [],
            "error": (error as? LocalizedError)?.errorDescription
              ?? error.localizedDescription
          ])
        }
      }
      return
    }

    if
      message["type"] as? String == "setActiveBoard",
      let boardId = message["boardId"] as? String,
      !boardId.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    {
      HomeboardSharedImportStore.setActiveBoard(boardId)
      complete(context, message: ["updated": true])
      return
    }

    let requestedBoardId = (message["boardId"] as? String)
      ?? HomeboardSharedImportStore.activeBoardId
    guard
      message["type"] as? String == "saveListing",
      let pendingImport = HomeboardSharedImportStore.PendingImport(
        message: message,
        boardId: requestedBoardId
      )
    else {
      complete(context, message: [
        "saved": false,
        "error": "Homeboard could not read this listing."
      ])
      return
    }

    Task {
      let receipt = await HomeboardListingSavePipeline.enqueue(
        pendingImport,
        boardId: requestedBoardId
      )
      guard receipt.savedLocally else {
        complete(context, message: [
          "saved": false,
          "synced": false,
          "hasActiveBoard": receipt.hasDestinationBoard,
          "error": "Homeboard could not safely queue this listing. Open the app and try again."
        ])
        return
      }

      // Native messaging is complete as soon as the durable queue write lands.
      // Server sync is opportunistic and never delays the website confirmation.
      complete(context, message: [
        "saved": true,
        "synced": false,
        "queued": true,
        "hasActiveBoard": receipt.hasDestinationBoard
      ])
      Task.detached(priority: .utility) {
        try? await HomeboardListingSavePipeline.synchronize(receipt)
      }
    }
  }

  private func complete(_ context: NSExtensionContext, message: [String: Any]) {
    let response = NSExtensionItem()
    response.userInfo = [SFExtensionMessageKey: message]
    context.completeRequest(returningItems: [response], completionHandler: nil)
  }
}
