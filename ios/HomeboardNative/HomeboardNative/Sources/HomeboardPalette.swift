import SwiftUI

enum HomeboardPalette {
  // Homeboard intentionally has one neutral appearance: charcoal eucalyptus + cream.
  static let background = color(0x3D504A)
  static let backgroundSecondary = color(0x465B54)

  static let surface = color(0x4B6159)
  static let surfaceDeep = color(0x31443E)
  static let surfaceMuted = color(0x435A52)

  static let border = color(0x92A79E).opacity(0.62)
  static let borderStrong = color(0xB2C3BA).opacity(0.78)

  static let primaryText = color(0xFFF3E5)
  static let secondaryText = color(0xE7DACE)
  static let tertiaryText = color(0xE1D5C8)
  static let buttonText = color(0x243129)

  static let accent = color(0xF9E2CD)
  static let accentStrong = color(0xE4CDB5)
  static let accentSecondary = color(0xD7CEAF)
  static let success = color(0x9ED3AB)
  static let danger = color(0xFFB4AB)
  static let skeletonBase = color(0x536B62)
  static let skeletonHighlight = color(0x879B92)

  private static func color(_ hex: UInt) -> Color {
    Color(
      red: Double((hex >> 16) & 0xFF) / 255,
      green: Double((hex >> 8) & 0xFF) / 255,
      blue: Double(hex & 0xFF) / 255
    )
  }

  static var accentGradient: LinearGradient {
    LinearGradient(
      colors: [
        accent,
        accentStrong,
        accent.opacity(0.78)
      ],
      startPoint: .topLeading,
      endPoint: .bottomTrailing
    )
  }

  static var authPanelFill: LinearGradient {
    LinearGradient(
      colors: [
        surface,
        surface
      ],
      startPoint: .topLeading,
      endPoint: .bottomTrailing
    )
  }

  static var cardFill: LinearGradient {
    LinearGradient(
      colors: [
        surface.opacity(0.98),
        surface,
        surfaceDeep,
        surfaceDeep.opacity(0.88)
      ],
      startPoint: .topLeading,
      endPoint: .bottomTrailing
    )
  }

  static var cardStroke: LinearGradient {
    LinearGradient(
      colors: [
        borderStrong,
        border,
        border.opacity(0.62)
      ],
      startPoint: .topLeading,
      endPoint: .bottomTrailing
    )
  }

  static var insetFill: LinearGradient {
    LinearGradient(
      colors: [
        surfaceMuted,
        surfaceMuted.opacity(0.90),
        surfaceDeep.opacity(0.72)
      ],
      startPoint: .topLeading,
      endPoint: .bottomTrailing
    )
  }

  static var insetStroke: LinearGradient {
    LinearGradient(
      colors: [
        borderStrong,
        border,
        border.opacity(0.72)
      ],
      startPoint: .topLeading,
      endPoint: .bottomTrailing
    )
  }
}

// MARK: - Main Card

struct HomeboardCardModifier: ViewModifier {
  var cornerRadius: CGFloat = 28
  var glow: Bool = true

  func body(content: Content) -> some View {
    content
      .background {
        ZStack {
          RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
            .fill(HomeboardPalette.cardFill)

          Circle()
            .fill(Color.white.opacity(0.05))
            .blur(radius: 26)
            .offset(x: -120, y: -100)

          Circle()
            .fill(HomeboardPalette.accent.opacity(glow ? 0.08 : 0.03))
            .blur(radius: 34)
            .offset(x: 130, y: -85)

          Circle()
            .fill(HomeboardPalette.accentSecondary.opacity(glow ? 0.06 : 0.02))
            .blur(radius: 38)
            .offset(x: 120, y: 95)

          Circle()
            .fill(Color.black.opacity(0.16))
            .blur(radius: 30)
            .offset(x: 90, y: 115)
        }
      }
      .clipShape(RoundedRectangle(cornerRadius: cornerRadius, style: .continuous))
      .overlay {
        RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
          .stroke(HomeboardPalette.cardStroke, lineWidth: 1)
      }
      .overlay {
        RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
          .stroke(Color.black.opacity(0.28), lineWidth: 1)
          .blur(radius: 0.6)
          .offset(y: 1)
          .mask {
            RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
          }
      }
      .shadow(color: Color.black.opacity(0.42), radius: 24, x: 0, y: 18)
      .shadow(color: Color.black.opacity(0.18), radius: 8, x: 0, y: 4)
      .shadow(color: HomeboardPalette.accentStrong.opacity(glow ? 0.04 : 0), radius: 18, x: 0, y: 10)
  }
}

extension View {
  func homeboardCard(
    cornerRadius: CGFloat = 28,
    glow: Bool = true
  ) -> some View {
    modifier(HomeboardCardModifier(cornerRadius: cornerRadius, glow: glow))
  }
}

// MARK: - Skeleton Loading

struct HomeboardSkeletonBlock: View {
  var width: CGFloat? = nil
  var height: CGFloat
  var cornerRadius: CGFloat = 10

  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  @State private var shimmerOffset: CGFloat = -1.4

  var body: some View {
    GeometryReader { geometry in
      RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
        .fill(HomeboardPalette.skeletonBase.opacity(0.72))
        .overlay {
          if !reduceMotion {
            LinearGradient(
              colors: [
                .clear,
                HomeboardPalette.skeletonHighlight.opacity(0.78),
                .clear
              ],
              startPoint: .leading,
              endPoint: .trailing
            )
            .frame(width: max(geometry.size.width * 0.58, 42))
            .offset(x: shimmerOffset * geometry.size.width)
          }
        }
        .clipShape(RoundedRectangle(cornerRadius: cornerRadius, style: .continuous))
    }
    .frame(width: width, height: height)
    .onAppear {
      guard !reduceMotion else { return }
      shimmerOffset = -1.4
      withAnimation(.linear(duration: 1.15).repeatForever(autoreverses: false)) {
        shimmerOffset = 1.4
      }
    }
    .accessibilityHidden(true)
  }
}

struct HomeboardListingSkeletonCard: View {
  var body: some View {
    HStack(spacing: 13) {
      HomeboardSkeletonBlock(width: 112, height: 96, cornerRadius: 16)

      VStack(alignment: .leading, spacing: 9) {
        HomeboardSkeletonBlock(width: 82, height: 16, cornerRadius: 6)
        HomeboardSkeletonBlock(height: 13, cornerRadius: 6)
        HomeboardSkeletonBlock(width: 138, height: 11, cornerRadius: 5)
        HomeboardSkeletonBlock(width: 104, height: 11, cornerRadius: 5)
      }
    }
    .padding(12)
    .homeboardInsetSurface(cornerRadius: 20)
  }
}

struct HomeboardScreenSkeleton: View {
  var body: some View {
    ZStack {
      HomeboardBackgroundView()

      VStack(alignment: .leading, spacing: 18) {
        HStack {
          VStack(alignment: .leading, spacing: 8) {
            HomeboardSkeletonBlock(width: 92, height: 11, cornerRadius: 5)
            HomeboardSkeletonBlock(width: 210, height: 26, cornerRadius: 8)
          }
          Spacer()
          HomeboardSkeletonBlock(width: 42, height: 42, cornerRadius: 21)
        }

        HomeboardSkeletonBlock(height: 74, cornerRadius: 20)
        HomeboardListingSkeletonCard()
        HomeboardListingSkeletonCard()
        Spacer()
      }
      .padding(.horizontal, 18)
      .padding(.top, 62)
    }
    .transition(.opacity)
    .accessibilityLabel("Loading Homeboard")
  }
}

struct HomeboardBoardSkeleton: View {
  var body: some View {
    GeometryReader { geometry in
      ZStack {
        HomeboardBackgroundView()

        VStack(spacing: 8) {
          HStack(spacing: 10) {
            VStack(alignment: .leading, spacing: 6) {
              HomeboardSkeletonBlock(width: 154, height: 14, cornerRadius: 6)
              HomeboardSkeletonBlock(width: 92, height: 10, cornerRadius: 5)
            }

            Spacer()

            HomeboardSkeletonBlock(width: 34, height: 34, cornerRadius: 17)
            HomeboardSkeletonBlock(width: 34, height: 34, cornerRadius: 17)
          }
          .padding(.horizontal, 12)
          .frame(height: 54)
          .homeboardInsetSurface(cornerRadius: 18)

          HStack(spacing: 9) {
            HomeboardSkeletonBlock(width: 76, height: 34, cornerRadius: 13)
            HomeboardSkeletonBlock(width: 82, height: 34, cornerRadius: 13)
            Spacer()
            HomeboardSkeletonBlock(width: 76, height: 34, cornerRadius: 17)
          }
          .padding(.horizontal, 7)
          .frame(height: 46)
          .homeboardInsetSurface(cornerRadius: 15)

          HomeboardMapSkeletonCanvas()
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .frame(minHeight: 270)
            .layoutPriority(1)

          HStack(spacing: 12) {
            HomeboardSkeletonBlock(width: 76, height: 76, cornerRadius: 15)

            VStack(alignment: .leading, spacing: 8) {
              HomeboardSkeletonBlock(width: 96, height: 16, cornerRadius: 6)
              HomeboardSkeletonBlock(height: 13, cornerRadius: 5)
              HomeboardSkeletonBlock(width: 148, height: 11, cornerRadius: 5)
            }
          }
          .padding(10)
          .frame(height: 96)
          .homeboardInsetSurface(cornerRadius: 20)

          HStack {
            Spacer()
            HomeboardSkeletonBlock(width: 32, height: 32, cornerRadius: 10)
            Spacer()
            HomeboardSkeletonBlock(width: 32, height: 32, cornerRadius: 10)
            Spacer()
            HomeboardSkeletonBlock(width: 32, height: 32, cornerRadius: 10)
            Spacer()
          }
          .frame(height: 54)
          .homeboardInsetSurface(cornerRadius: 18)
        }
        .padding(.horizontal, 14)
        .padding(.top, max(geometry.safeAreaInsets.top, 8))
        .padding(.bottom, max(geometry.safeAreaInsets.bottom, 8))
      }
    }
    .transition(.opacity)
    .accessibilityLabel("Loading the Homeboard map")
  }
}

private struct HomeboardMapSkeletonCanvas: View {
  var body: some View {
    ZStack {
      RoundedRectangle(cornerRadius: 22, style: .continuous)
        .fill(HomeboardPalette.surfaceDeep)

      VStack(spacing: 10) {
        ProgressView()
          .controlSize(.large)
          .tint(HomeboardPalette.accent)

        Text("Loading map")
          .font(.caption.weight(.semibold))
          .foregroundStyle(HomeboardPalette.secondaryText)
      }
    }
    .overlay {
      RoundedRectangle(cornerRadius: 22, style: .continuous)
        .stroke(HomeboardPalette.border, lineWidth: 1)
    }
  }
}

struct HomeboardCommuteRangeControl: View {
  @Binding var minimumMinutes: Int
  @Binding var maximumMinutes: Int
  var bounds: ClosedRange<Int> = 0...120
  var step = 5

  private enum ActiveHandle {
    case minimum
    case maximum
  }

  @State private var activeHandle: ActiveHandle?

  var body: some View {
    VStack(alignment: .leading, spacing: 12) {
      HStack(alignment: .top) {
        rangeLabel("TOO CLOSE", value: minimumMinutes, alignment: .leading)
        Spacer()
        VStack(spacing: 2) {
          Text("FULL SCORE")
            .font(.system(size: 9, weight: .bold))
            .tracking(0.8)
            .foregroundStyle(HomeboardPalette.success)
          Text("\(minimumMinutes)–\(maximumMinutes) min")
            .font(.caption.weight(.bold))
            .foregroundStyle(HomeboardPalette.primaryText)
            .monospacedDigit()
        }
        Spacer()
        rangeLabel("TOO FAR", value: maximumMinutes, alignment: .trailing)
      }

      GeometryReader { geometry in
        let width = max(geometry.size.width, 1)
        let lowerX = xPosition(for: minimumMinutes, width: width)
        let upperX = xPosition(for: maximumMinutes, width: width)

        ZStack(alignment: .leading) {
          Capsule()
            .fill(Color.white.opacity(0.10))
            .frame(height: 7)

          Capsule()
            .fill(HomeboardPalette.success.opacity(0.72))
            .frame(width: max(upperX - lowerX, 0), height: 7)
            .offset(x: lowerX)

          handle(at: lowerX, label: "Too close at \(minimumMinutes) minutes")
          handle(at: upperX, label: "Too far at \(maximumMinutes) minutes")
        }
        .frame(height: 44)
        .contentShape(Rectangle())
        .gesture(
          DragGesture(minimumDistance: 0)
            .onChanged { value in
              if activeHandle == nil {
                activeHandle = abs(value.location.x - lowerX) <= abs(value.location.x - upperX)
                  ? .minimum
                  : .maximum
              }
              updateActiveHandle(at: value.location.x, width: width)
            }
            .onEnded { _ in
              activeHandle = nil
            }
        )
      }
      .frame(height: 44)

      Text("Every commute inside this range receives the same commute score. Scores fall as a route moves beyond either handle.")
        .font(.caption)
        .foregroundStyle(HomeboardPalette.secondaryText)
        .fixedSize(horizontal: false, vertical: true)
    }
    .padding(14)
    .homeboardInsetSurface(cornerRadius: 17, accent: HomeboardPalette.success)
  }

  private func rangeLabel(
    _ title: String,
    value: Int,
    alignment: HorizontalAlignment
  ) -> some View {
    VStack(alignment: alignment, spacing: 2) {
      Text(title)
        .font(.system(size: 9, weight: .bold))
        .tracking(0.8)
        .foregroundStyle(HomeboardPalette.tertiaryText)
      Text("\(value)m")
        .font(.caption.weight(.heavy))
        .foregroundStyle(HomeboardPalette.primaryText)
        .monospacedDigit()
    }
  }

  private func handle(at x: CGFloat, label: String) -> some View {
    Circle()
      .fill(HomeboardPalette.primaryText)
      .frame(width: 24, height: 24)
      .overlay {
        Circle()
          .fill(HomeboardPalette.success)
          .frame(width: 10, height: 10)
      }
      .shadow(color: Color.black.opacity(0.35), radius: 5, y: 2)
      .offset(x: x - 12)
      .accessibilityLabel(label)
  }

  private func xPosition(for value: Int, width: CGFloat) -> CGFloat {
    let progress = Double(value - bounds.lowerBound)
      / Double(max(bounds.upperBound - bounds.lowerBound, 1))
    return width * CGFloat(min(max(progress, 0), 1))
  }

  private func updateActiveHandle(at x: CGFloat, width: CGFloat) {
    let rawProgress = min(max(Double(x / max(width, 1)), 0), 1)
    let rawValue = Double(bounds.lowerBound)
      + rawProgress * Double(bounds.upperBound - bounds.lowerBound)
    let snapped = Int((rawValue / Double(step)).rounded()) * step
    switch activeHandle {
    case .minimum:
      minimumMinutes = min(max(snapped, bounds.lowerBound), maximumMinutes - step)
    case .maximum:
      maximumMinutes = max(min(snapped, bounds.upperBound), minimumMinutes + step)
    case nil:
      break
    }
  }
}

struct HomeboardPanelModifier: ViewModifier {
  var cornerRadius: CGFloat = 26

  func body(content: Content) -> some View {
    content
      .background {
        RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
          .fill(HomeboardPalette.authPanelFill)
      }
      .clipShape(RoundedRectangle(cornerRadius: cornerRadius, style: .continuous))
      .overlay {
        RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
          .stroke(HomeboardPalette.border, lineWidth: 1)
      }
      .shadow(color: Color.black.opacity(0.24), radius: 18, x: 0, y: 10)
  }
}

extension View {
  func homeboardPanel(cornerRadius: CGFloat = 26) -> some View {
    modifier(HomeboardPanelModifier(cornerRadius: cornerRadius))
  }
}

// MARK: - Raised Inner Surfaces

struct HomeboardInsetSurfaceModifier: ViewModifier {
  var cornerRadius: CGFloat = 16
  var accent: Color? = nil

  func body(content: Content) -> some View {
    content
      .background {
        ZStack {
          RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
            .fill(HomeboardPalette.insetFill)

          if let accent = accent {
            Circle()
              .fill(accent.opacity(0.10))
              .blur(radius: 18)
              .offset(x: 82, y: -44)
          }

          Circle()
            .fill(Color.white.opacity(0.02))
            .blur(radius: 14)
            .offset(x: -55, y: -42)

          Circle()
            .fill(Color.black.opacity(0.12))
            .blur(radius: 16)
            .offset(x: -65, y: 42)
        }
      }
      .clipShape(RoundedRectangle(cornerRadius: cornerRadius, style: .continuous))
      .overlay {
        RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
          .stroke(HomeboardPalette.insetStroke, lineWidth: 1)
      }
      .shadow(color: Color.black.opacity(0.16), radius: 8, x: 0, y: 5)
  }
}

extension View {
  func homeboardInsetSurface(
    cornerRadius: CGFloat = 18,
    accent: Color? = nil
  ) -> some View {
    modifier(
      HomeboardInsetSurfaceModifier(
        cornerRadius: cornerRadius,
        accent: accent
      )
    )
  }
}
