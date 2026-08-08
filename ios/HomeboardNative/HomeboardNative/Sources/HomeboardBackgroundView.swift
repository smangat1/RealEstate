import SwiftUI

struct HomeboardBackgroundView: View {
  var body: some View {
    GeometryReader { geometry in
      ZStack {
        HomeboardPalette.background

        LinearGradient(
          colors: [
            HomeboardPalette.surface.opacity(0.86),
            HomeboardPalette.backgroundSecondary,
            HomeboardPalette.background
          ],
          startPoint: .top,
          endPoint: .bottom
        )

        VStack(spacing: 0) {
          ForEach(0..<18, id: \.self) { _ in
            Rectangle()
              .fill(HomeboardPalette.border.opacity(0.22))
              .frame(height: 1)
            Spacer()
          }
        }
        .frame(width: geometry.size.width, height: geometry.size.height)
        .opacity(0.5)

        LinearGradient(
          colors: [
            Color.clear,
            HomeboardPalette.surfaceDeep.opacity(0.14),
            HomeboardPalette.surfaceDeep.opacity(0.34)
          ],
          startPoint: .topLeading,
          endPoint: .bottomTrailing
        )
      }
      .frame(width: geometry.size.width, height: geometry.size.height)
    }
    .ignoresSafeArea()
  }
}
