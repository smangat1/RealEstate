# Homeboard iOS UI test audit and launch contract

Base/reference SHA: `c2eb1fe8d0c08ec8fe286326d9119305b0f6af5c` (remote main).

The original checkout was on `ui-tests-core-flows` at `caaa7cb824d3e4d9c58693d554acfec7ae0de88a`, with many tracked modifications/deletions and macOS dataless Git refs. Its local main/origin main were stale. After the user authorized continuation, work moved to a separate clean clone at `~/Documents/RealEstate-xcuitest`; the original checkout was preserved. GitHub compare reported divergence: main was 18 commits ahead and 8 behind the original branch (the original branch was 8 ahead and 18 behind main). There was no remote UI-test branch or open PR. No earlier UI-test work was merged or applied.

PR [#14](https://github.com/smangat1/RealEstate/pull/14) is merged. Fresh main's local ancestry includes its merge commit and the nested heads `c11443c3f98e8a29e284720523d692a666359e0b` and `f17ee50d4b14ced2ff78dc591a29c8d9a0a2a6a5`. The original checkout lacked the current main object; those checks were completed in the fresh clone. No AGENTS.md was found in the repository or its parent paths.

## Requirement checklist before implementation

| Requirement | Audit status and evidence |
| --- | --- |
| Three existing welcome smoke tests | Implemented, runtime unverified at initial audit; `HomeboardNativeUITests.swift` on main. Retained. |
| UI test target and scheme | Implemented and statically verified in `project.yml` and generated HomeboardNative scheme. |
| DEBUG fixture | Partial, only in original working folder: `UITestFixture.swift`. Not in main/project source list, not invoked by AppModel. Seed data reused. |
| Stateful isolated backend | Missing. Earlier stub returned static boards and success on unknown routes; lacked acceptance validation/readback. |
| Local generation seam and diagnostics | Missing on main and in inspected earlier files. Production generator and acceptance pipeline exist on main. |
| Core UI flows | Partial, only in original folder's `HomeboardNativeCoreFlowUITests.swift`; lacked creation, add listing, invite and vote flows. Selectors/expectations were not runtime verified. |
| Advisor success and POST failure | Partial, only in original folder's `HomeboardNativeAdvisorChatUITests.swift`; broad first-card assertions could match previous output; no proof of generation/save. |
| Save failure/recovery, fallback, tone/toggle and stale generation | Missing. |
| Opt-in real Apple Intelligence lane | Missing. |
| CI UI execution | Missing: GitHub workflow runs npm verify and Prisma validation, not Xcode UI tests. |

## Launch contract

Fixture app launches require `-homeboard.resetForUITesting -homeboard.uiTestFixture`. Persistence resets before fixture state; fake auth stays in memory. Ordinary DEBUG launches retain real authentication. All fixture/transport/generator seams and diagnostics compile out of Release.

| Environment variable | Values |
| --- | --- |
| `UITEST_ADVISOR_PROVIDER` | `deterministic` (default), `fallback` (production generator with model availability forced false), `apple_intelligence` (production availability and generator unchanged) |
| `UITEST_ADVISOR_MODE` | `ok` (default), `fail` (Advisor POST 500), `save-fail` (first acceptance PATCH 500, later recovery succeeds), `mismatch` (health capability false) |
| `UITEST_WALLET_INACTIVE` | `1` selects inactive wallet; otherwise active |
| `UITEST_ONBOARDING` | `1` selects a synthetic signed-in account without membership; creation uses the existing onboarding/confirmation flow |
| `UITEST_DELAY_GENERATION` | `1` makes Casual test generation finish after 15 seconds even if cancelled; latest-card revision checks remain real |

The deterministic provider uses production-schema source `device_template`; the diagnostic `provider` field is the honest test-provider label. It never claims Apple Intelligence. The separate fallback provider calls the actual production template generator. The real provider can legitimately return `device_template`, but that outcome fails the real inference lane.

The fixture API origin is `https://homeboard-fixture.invalid`. HomeboardAPI sessions explicitly install the fixture URLProtocol; registration also intercepts other default sessions. Every handled route uses state; unexpected/malformed requests return HTTP 599 and appear in read-only diagnostics. No passthrough exists. Listing geocoding and address autocomplete are suppressed in fixture flows. Synthetic account, board and Keychain persistence is disabled in fixture mode; ordinary DEBUG launches retain the original persistence behavior. Payment and external composer controls are never activated.

Diagnostics are exposed through `homeboard.fixture.diagnostics` accessibility value. They contain original command/context, message identity, generator input/output/source, submitted acceptance payloads, save success, stored state, GET readback, unexpected requests and actual FoundationModels availability. UI assertions independently inspect the matching rendered draft/ready state and exact user row.

A small composer fix returns the model's failed Advisor prompt to the visible chat field, using the existing `boardMessageDraft` failure contract. Normal generation/default providers and draft validation remain unchanged.

## Rerun

On this Mac, installed destination is iPhone 17 / iOS 26.5, UDID `20E336D1-C356-40CF-BB38-4B256E7BC18D`. Xcode is 26.6 (17F113). List devices again before using these commands elsewhere.

```sh
npm run ios:generate
xcodebuild -list -project ios/HomeboardNative/HomeboardNative.xcodeproj
xcrun simctl list devices available
xcodebuild test -project ios/HomeboardNative/HomeboardNative.xcodeproj -scheme HomeboardNative -destination 'platform=iOS Simulator,id=20E336D1-C356-40CF-BB38-4B256E7BC18D' -only-testing:HomeboardNativeUITests/HomeboardNativeCoreFlowUITests
xcodebuild test -project ios/HomeboardNative/HomeboardNative.xcodeproj -scheme HomeboardNative -destination 'platform=iOS Simulator,id=20E336D1-C356-40CF-BB38-4B256E7BC18D' -only-testing:HomeboardNativeUITests/HomeboardNativeAdvisorChatUITests
npm run ios:release
# Use the CI-placeholder verification environment documented below for web checks.
```

For actual inference, select **Homeboard Advisor Inference Tests**, set a supported iOS 26+ device destination with signing configured, and run only `HomeboardNativeUITests/HomeboardNativeAppleIntelligenceUITests`. The scheme explicitly sets `HOMEBOARD_RUN_REAL_AI=1` in the test runner. The ordinary scheme skips this lane. Device setup requires enabled Apple Intelligence and a downloaded ready model; the lane reads `SystemLanguageModel.default.isAvailable` and skips with actual availability details if false. Do not count a simulator name or iOS version as evidence of model readiness.

```sh
xcodebuild test -project ios/HomeboardNative/HomeboardNative.xcodeproj -scheme 'Homeboard Advisor Inference Tests' -destination 'platform=iOS,id=<supported-device-UDID>' -only-testing:HomeboardNativeUITests/HomeboardNativeAppleIntelligenceUITests
```

These suites check app-side outreach wiring and error states with synthetic context. They do not grade budget/ranking/commute answers. Real backend integration, Apple authentication, payments, external message dispatch, broad factual reliability, listing extraction intelligence, preference extraction and screenshot reply inference remain outside this coverage.

## Validation results

All runs used Xcode 26.6 (17F113), iPhone 17 / iOS 26.5, simulator UDID `20E336D1-C356-40CF-BB38-4B256E7BC18D`. No physical-device run was performed.

Focused reruns passed the six Advisor cases and ten core cases, including ordinary DEBUG relaunch without retained fixture credentials. The five sequential prompts plus GET readback passed in 146.980 seconds. Tone/fact regeneration passed in 53.713 seconds and explicitly proved the delayed old generation finished after the newer generation without replacing it. Recovery and listing entry passed together in 186.121 seconds of UI execution. The fixture unit checks passed in 0.040 seconds; they reject unknown routes/origins, wrong identities, malformed payloads and falsely labeled sources, and verify exact persistence/readback.

Initial iterations exposed an outdated Advisor setup version, missing polling/photo handling, combined accessibility labels, refresh positioning and gestures crossing fixed UI/keyboard overlays. These were repaired; assertions and production draft validation were retained.

Before revision `697d3fca5e701498a222a806098e1fe8434c4fa0` was pushed, `npm run verify:all` was invoked exactly once in the local working tree. It stopped at a repository copy-rule test because a reused fixture message contained an em dash (285/286 tests passed). That fixture copy was corrected. A later local working-tree `npm run verify` passed secrets, environment contract, lint, all 286 tests and both TypeScript checks, but its build stopped because the fresh clone had no Supabase environment settings. `npm run build` then passed locally with the same non-production placeholders used by `.github/workflows/verify.yml`; `npm run prisma:validate` passed with a password-free dummy loopback database URL. Prisma validation/generation performed no migrations or database verification. These are earlier local results, not validation of the pushed revision.

On pushed revision `697d3fca5e701498a222a806098e1fe8434c4fa0`, GitHub Actions reproduced a different failure: `npm run verify` stopped immediately in `npm run secrets:check` because this audit contained two password-shaped dummy database URLs. No later verify stage ran in that CI job. The continuation replaced those examples with the password-free local/CI placeholder below; `npm run secrets:check` then passed on the corrected revision.

The opt-in **Homeboard Advisor Inference Tests** run actually launched with `UITEST_ADVISOR_PROVIDER=apple_intelligence`. FoundationModels reported `modelAvailable=true`, `availability=available`, but production generation and acceptance returned `device_template`. The strict `apple_intelligence` source assertion failed after 48.653 seconds. This is a failed inference validation, not an AI pass or an unavailable-model skip. Real tone inference was NOT RUN after that failure. The specific internal model-error/output-validation fallback reason was not recorded by the production generator. A ready supported physical-device inference pass remains the validation gate; the PR is draft/not merge-ready for that reason.

The final full **HomeboardNative** scheme passed: 72 Swift unit tests plus 19 UI tests, zero failures. The separate opt-in inference case was skipped by its ordinary-scheme guard (92 total cases: 91 passed, 1 skipped). All three existing welcome smoke tests passed. Combined recorded UI case durations were 464.754 seconds (7 minutes 45 seconds); Xcode's testing session took 569.992 seconds (9 minutes 30 seconds). The complete result-bundle interval, including preparation, was 593.202 seconds.

Result bundle: `/tmp/homeboard-ui-derived/Logs/Test/Test-HomeboardNative-2026.10.01_00-14-54--0400.xcresult`. Xcode recorded invalid-frame runtime warnings in several flows; they did not fail XCTest and their root cause was not investigated in this test-focused change. Extension activation-rule and debugger-version warnings also appeared. These results validate synthetic app-side flows, not backend integration or physical-device inference.

`npm run ios:release` passed (exit 0) for the generic iOS simulator destination, producing a universal x86_64/arm64 Release app. `strings` and `nm -a` confirmed the four fixture launch/diagnostic markers (`homeboard.uiTestFixture`, `homeboard-fixture.invalid`, `homeboard.fixture.diagnostics`, `UITEST_ADVISOR_PROVIDER`) and the fixture/protocol/diagnostics/injected-generator symbol families are absent from Release. The same markers and symbols were present in the Debug dylib as positive controls. Fixture code is compiled out; ordinary DEBUG relaunch without fixture authentication was also runtime verified.

Final review and `git diff --check` passed. No existing welcome coverage was removed, no second fixture was added, and no real authentication, external dispatch, payment or backend integration was exercised. The remaining validation gate is real FoundationModels inference and tone regeneration on a ready supported physical test device.

## Exact final verification environment

A temporary shell wrapper reused the existing DerivedData and disabled simulator code signing. It changed no repository scripts or Xcode preferences:

```sh
mkdir -p /tmp/homeboard-xcode-bin
cat > /tmp/homeboard-xcode-bin/xcodebuild <<'SH'
#!/bin/sh
exec /usr/bin/xcodebuild -derivedDataPath /tmp/homeboard-ui-derived "$@" CODE_SIGNING_ALLOWED=NO
SH
chmod +x /tmp/homeboard-xcode-bin/xcodebuild
```

The single aggregate attempt was:

```sh
PATH="/tmp/homeboard-xcode-bin:$PATH" DATABASE_URL='postgresql://fixture@127.0.0.1:1/fixture' npm run verify:all
```

After correcting fixture copy, `npm run verify` used that same environment. The remaining build/Prisma/full-iOS/Release checks used:

```sh
env PATH="/tmp/homeboard-xcode-bin:$PATH" \
  SUPABASE_URL=https://ci.invalid \
  SUPABASE_PUBLISHABLE_KEY=ci-publishable-placeholder \
  SUPABASE_SECRET_KEY=ci-secret-placeholder \
  NEXT_PUBLIC_SUPABASE_URL=https://ci.invalid \
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=ci-publishable-placeholder \
  DATABASE_URL='postgresql://fixture@127.0.0.1:1/fixture' \
  ENABLE_APP=false DEMO_MODE=false HOMEBOARD_NOINDEX=true \
  /bin/sh -c 'npm run build && npm run prisma:validate && npm run ios:test && npm run ios:release'
```

The actual simulator inference probe selected the three new classes in the opt-in scheme:

```sh
xcodebuild test -project ios/HomeboardNative/HomeboardNative.xcodeproj -scheme 'Homeboard Advisor Inference Tests' -destination 'platform=iOS Simulator,id=20E336D1-C356-40CF-BB38-4B256E7BC18D' -derivedDataPath /tmp/homeboard-ui-derived -only-testing:HomeboardNativeUITests/HomeboardNativeAdvisorChatUITests -only-testing:HomeboardNativeUITests/HomeboardNativeCoreFlowUITests -only-testing:HomeboardNativeUITests/HomeboardNativeAppleIntelligenceUITests CODE_SIGNING_ALLOWED=NO
```

## PR #15 continuation validation

Revision `697d3fca5e701498a222a806098e1fe8434c4fa0` was re-audited from freshly fetched `main` `c2eb1fe8d0c08ec8fe286326d9119305b0f6af5c`. Its GitHub `web` check failed in `npm run secrets:check` before any later verify stage. A clean-clone reproduction failed the same way. Commit `f9f9ac2f98c758baafae284aafab3c5fc94df494` replaced only the two credential-shaped documentation examples with `postgresql://fixture@127.0.0.1:1/fixture`; the strict scanner was unchanged and then passed with 401 tracked files scanned.

The real-inference tone assertion previously searched all saved acceptances, so its first Professional receipt could satisfy the Casual assertion. The continuation requires a successful acceptance and matching generator record after captured acceptance/generation boundaries, for the same message ID, exact requested tone and exact `apple_intelligence` source. It also compares the rendered card to that generated/saved text, forces a subsequent board GET and verifies the same text, tone, source, ready status and accepted timestamp in readback. The ordinary-scheme opt-in skip and strict fallback rejection remain unchanged.

A delayed POST-failure fixture now exposes an explicit pending window. The regression types a different roommate message while the Advisor POST is still pending and verifies that the later failure does not overwrite that newer composer text. The first focused combined run had one pass (the existing stale-generation tone case) and one failure: the original two-second fixture delay expired during UI input, leaving a suffix of the restored Advisor command in the field. The delay was widened to eight seconds, the test now proves the composer was empty and the error absent before typing, and its focused rerun passed. `HomeboardNativeTests/UITestFixtureTests` also passed after adding post-boundary tone persistence/readback and bounded-diagnostic coverage.

The DEBUG-only FoundationModels diagnostic records at most 20 entries and only message identity, selected tone, stage and a fixed reason code. It records no draft text, prompt, board context or financial values, and does not alter Release behavior or any production validation/fallback decision. The strict opt-in run on the iPhone 17 / iOS 26.5 simulator reported `modelAvailable=true` and `availability=available`. Professional generation produced and saved a fresh `apple_intelligence` acceptance. Casual regeneration produced `device_template`; the new diagnostic identified `validation_failure / financial_sentence_missing`, rather than a model exception. The strict test therefore failed as intended before claiming a Casual AI save or GET readback. Result bundle: `/tmp/homeboard-pr15-inference.xcresult`.

The only connected physical device was an iPhone 15 Pro on iOS 18.7.8 (`22H352`), which cannot run the iOS 26 FoundationModels lane. A ready physical-device pass remains unresolved; simulator fallback is not relabeled as AI. The retained inference screenshot was inspected: the Advisor card remained readable, but the result activities contained `Invalid frame dimension (negative or non-finite).` while the chat field was tapped. This continuation does not claim the UI layout warning is clean or resolved.

The subsequent draft-composition fix removes the exact financial sentence from the model prompt and appends that policy text deterministically after validating the model-authored body. Omit mode appends nothing. Model-authored income, credit-score or financial-information claims still fail closed. Known trailing signature placeholders are replaced only with the app-owned sender name; any remaining bracketed placeholder is rejected. Eight focused `UITestFixtureTests` passed for include, omit, sign-off placement, placeholder handling, persistence and diagnostics. The delayed POST-failure UI regression also passed. A strict simulator run before the generic placeholder check produced fresh Professional and Casual `apple_intelligence` acceptances with Casual GET readback; once placeholder rejection was tightened, two later probes correctly rejected model output containing a signature placeholder instead of relabeling fallback as AI. The final strict probe after deterministic signature handling was stopped at the user's request, so the final working revision does not claim a completed strict-inference pass. The invalid-frame warning still appears during the simulator keyboard safe-area transition; the retained card screenshot has no visible clipping, but the runtime warning remains unresolved.

Final continuation gates used the repository CI placeholders and made no database connection or migration:

```sh
env \
  SUPABASE_URL=https://ci.invalid \
  SUPABASE_PUBLISHABLE_KEY=ci-publishable-placeholder \
  SUPABASE_SECRET_KEY=ci-secret-placeholder \
  NEXT_PUBLIC_SUPABASE_URL=https://ci.invalid \
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=ci-publishable-placeholder \
  DATABASE_URL='postgresql://ci@localhost:5432/homeboard' \
  ENABLE_APP=false DEMO_MODE=false HOMEBOARD_NOINDEX=true \
  npm run verify

npm run ios:test
npm run ios:release
```

For revision `8051b4d618b0dae756af42752e86649ab811483f`, `npm run verify` passed in full. The full ordinary HomeboardNative scheme passed, with the opt-in inference test skipped by its ordinary-scheme guard. The Release simulator build and fixture-isolation marker/symbol checks passed: the fixture launch/diagnostic markers and fixture/protocol/diagnostic/injected-generator symbol families were absent from Release and present in Debug as positive controls. Existing extension activation-rule and debugger-version warnings remain. At the user's request, those long-running full gates were not repeated after the subsequent draft-composition fix described above.
