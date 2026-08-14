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
        let analysis = await HomeboardListingIntelligence.analyze(
          message: message,
          allowSystemModel: allowSystemModel
        )
        complete(context, message: [
          "analyzed": true,
          "analysis": analysis.dictionary
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
      do {
        try await HomeboardExtensionSyncClient.saveListing(
          pendingImport,
          boardId: requestedBoardId
        )
        complete(context, message: [
          "saved": true,
          "synced": true,
          "hasActiveBoard": true
        ])
      } catch {
        HomeboardSharedImportStore.save(pendingImport)
        complete(context, message: [
          "saved": true,
          "synced": false,
          "hasActiveBoard": pendingImport.boardId != nil,
          "error": (error as? LocalizedError)?.errorDescription
            ?? error.localizedDescription
        ])
      }
    }
  }

  private func complete(_ context: NSExtensionContext, message: [String: Any]) {
    let response = NSExtensionItem()
    response.userInfo = [SFExtensionMessageKey: message]
    context.completeRequest(returningItems: [response], completionHandler: nil)
  }
}
