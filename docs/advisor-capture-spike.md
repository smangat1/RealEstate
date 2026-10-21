# Advisor capture spike

## Status and verdict

- Branch: `advisor-v3-capture-spike`
- Fresh `origin/main` and revert point: `1ed9dc37bcd1b967521976a2372c2ff3d90f18b2`
- Build environment: Xcode 26.6 with the iOS 26.5 SDK
- Simulator result: the Debug app, App Intent metadata, App Group store, local notification request, and debug screen compile successfully
- Test build result: `xcodebuild build-for-testing` succeeds for the iPhone 17 iOS 26.5 simulator. The full `npm run ios:test` runner was interrupted after it repeatedly stalled launching UI tests with Xcode's `DebuggerLLDB.DebuggerVersionStore.StoreError: no debugger version`; it reported no test assertion failure before the stall.
- Verdict: **proceed with caveats, pending the real-device matrix below**

The code proves that Homeboard can expose a background-capable App Intent with separate `sender` and `body` string parameters and can retain accepted values in its App Group. It does not prove that the Messages automation supplies either value. The iOS simulator cannot receive SMS, iMessage, or RCS messages, and this checkout has no iOS 27 SDK or runtime. Do not start the optional production message-trigger work until the device matrix is filled in.

## What the spike contains

`CaptureBrokerMessageIntent` accepts `sender` and `body`, keeps only allowlisted test handles, writes the complete values and timestamp to `group.com.homeboard.native`, and schedules a local notification containing the sender and the first 80 characters. The intent prefers background execution on iOS 26 and later and does not open Homeboard.

The DEBUG app has a yellow **Capture spike** button in the lower-right corner. Its screen shows retained messages newest first, the hardcoded allowlist, and a discard count. The test handles are intentionally fake and must be replaced in `AdvisorCaptureSpikeStore.testSenderHandles` before a device run.

## Answers to the five questions

### 1. Does the intent receive the real sender handle and full body in the background with no confirmation tap?

**Not yet verified on a real device.** The Homeboard side accepts and persists the real strings it is given, and the Debug simulator build succeeds. Apple documents that Message automations can run automatically, and that most App Intents can run quietly in the background. Apple's public Shortcuts documentation does not state that a Message trigger exposes the sender and full body as properties of its input. The device test must determine whether those properties appear and whether their values reach the intent while locked.

Reference: [Apple Shortcuts communication triggers](https://support.apple.com/guide/shortcuts/apdd711f9dff/ios) and [Apple App Intent runtime behavior](https://developer.apple.com/documentation/appintents/configuring-the-runtime-behavior-of-your-app-intents).

### 2. Does an iCloud-shared copy keep the message trigger input and call the intent?

**iOS 26: no distributable trigger.** Apple says a personal automation is device-specific and does not sync. An iCloud link shares a normal shortcut, not the separate personal Message automation. The second Apple ID can import the action shortcut, but must build its own Message automation and wire that automation's input into the imported shortcut. Whether those input properties survive the ordinary shortcut boundary still needs the two-device test.

**iOS 27: not yet verified.** The iOS 27 Shortcuts guide moves automations onto shortcuts through **Edit > Automation**, but Apple's sharing page does not say whether an attached trigger is included in an iCloud link or whether its privacy-sensitive input mapping is retained. Test both the trigger and its parameter tokens after import.

References: [iOS 26 personal automation behavior](https://support.apple.com/en-ie/guide/shortcuts/apd690170742/9.0/ios/26), [sharing shortcuts](https://support.apple.com/en-gb/guide/shortcuts/apdf01f8c054/9.0/ios/26), and [iOS 27 add automations](https://support.apple.com/en-asia/guide/shortcuts/apdfbdbd7123/10.0/ios/27).

### 3. Does it work for SMS, iMessage, and RCS?

**Not verified.** Apple describes one Message trigger and does not document different payload behavior by transport. Run all three cases because a trigger firing does not prove that its sender/body metadata is the same for SMS, iMessage, and RCS.

### 4. What does the forced Shortcuts banner say, and can it be collapsed?

**Not observed.** Record the exact text, icon, persistence, and whether an upward swipe collapses it during the device test. Apple's current guide says that an automation allowed to run while locked will not notify when triggered. That claim must be checked separately from the Homeboard local notification, which is expected and is titled **Homeboard captured a message**.

Reference: [allowing automations to run without interaction](https://support.apple.com/guide/shortcuts/add-automations-apdfbdbd7123/ios).

### 5. What iOS 26 versus iOS 27 differences were hit?

- This spike compiled against the iOS 26.5 SDK. No iOS 27 runtime was available locally.
- iOS 26 documents personal automations as separate, device-specific objects that do not sync.
- iOS 27 documents attaching an automation directly to a shortcut with **Edit > Automation**.
- iOS 27 uses **Privacy > Allow Running When Locked** in the current guide. The iOS 26 guide uses the older personal-automation flow and, on some minor versions, **Run Immediately** or **Ask Before Running** wording.
- App Intents on iOS 26 add `supportedModes`; the spike requests `.background` and keeps `openAppWhenRun = false` for older deployment targets.

## Build and prepare the iPhone

1. Check out `advisor-v3-capture-spike` and open `ios/HomeboardNative/HomeboardNative.xcodeproj` in Xcode 26.6 or newer.
2. In `AdvisorCaptureSpike.swift`, replace the two fake values in `testSenderHandles` with the sending phone numbers. Use country code and digits only, such as `12125551212`. Do not commit real numbers.
3. Select the HomeboardNative scheme, select the physical iPhone, and run the Debug build.
4. Launch Homeboard once. Accept notification permission so the visible proof notification can appear.
5. Tap the yellow **Capture spike** button and confirm that the screen opens and initially shows zero captured messages.
6. In Shortcuts, confirm that the Homeboard action **Capture Broker Message** appears. Run it manually once with an allowlisted sender and a distinctive long body. Confirm that the app stays closed, the local notification shows only the first 80 characters, and the debug screen retains the full body.
7. Run it manually with a non-allowlisted sender. Confirm that no Homeboard notification appears and the discard count increases by one.

## Build the Message automation on iOS 26

1. Open Shortcuts, tap **Automation**, tap **+**, and choose **Message**.
2. Leave **Sender** unfiltered. If Shortcuts refuses to continue without a sender or phrase, stop and record that result because it makes the proposed all-senders design a dead end on that OS version.
3. Choose **Run Immediately**, or turn off **Ask Before Running**, depending on the exact iOS 26 wording.
4. Add the Homeboard action **Capture Broker Message**.
5. Tap the intent's **Sender** field, choose the Message trigger input variable, then tap that variable and choose its sender property. Record the exact property name. If no sender property exists, stop and record failure.
6. Tap the intent's **Body** field, choose the same trigger input, and select its full text/content property. Record the exact property name. If no body property exists, stop and record failure.
7. Save the automation. Lock the iPhone and send an allowlisted iMessage containing more than 80 characters.
8. Without opening Homeboard first, note any Shortcuts banner and the Homeboard local notification. Then open the debug screen and compare the exact sender and complete body.

## Build the Message automation on iOS 27

1. Open or create a shortcut containing **Capture Broker Message**.
2. Tap **Edit > Automation**, choose **Message**, and leave the sender filter empty.
3. Wire the trigger's sender and body/content properties to the two intent parameters. Record the property names or the absence of either property.
4. Open the shortcut's info, choose **Privacy**, enable **Allow Running When Locked**, and save.
5. Lock the iPhone and repeat the same allowlisted iMessage test.

## Complete the transport matrix

Repeat the locked-phone test without changing the automation:

| OS | Transport | Trigger fired | Real sender retained | Full body retained | Confirmation tap | Shortcuts banner exact text / collapsible |
| --- | --- | --- | --- | --- | --- | --- |
| iOS 26 | iMessage | TBD | TBD | TBD | TBD | TBD |
| iOS 26 | SMS | TBD | TBD | TBD | TBD | TBD |
| iOS 26 | RCS | TBD | TBD | TBD | TBD | TBD |
| iOS 27 | iMessage | TBD | TBD | TBD | TBD | TBD |
| iOS 27 | SMS | TBD | TBD | TBD | TBD | TBD |
| iOS 27 | RCS | TBD | TBD | TBD | TBD | TBD |

For each test, also send one message from a non-allowlisted number and confirm only the discard count changes.

## Test the iCloud share boundary

1. On phone A, share the action shortcut using **Copy iCloud Link**.
2. On phone B signed into a different Apple ID, install the same Debug Homeboard build and launch it once.
3. Open the iCloud link and add the shortcut.
4. Before editing anything, inspect whether the Message automation exists and whether both Homeboard parameters still contain live trigger-variable tokens rather than blank text.
5. On iOS 26, expect to recreate the device-specific personal Message automation. Pass its input to the imported shortcut, then inspect whether the imported shortcut can still select sender and body details.
6. On iOS 27, first test the imported shortcut exactly as received. If the automation is missing, recreate it and record that sharing strips the trigger. If the automation exists but the tokens are blank, record that sharing breaks the parameter mapping.
7. Send an allowlisted message to phone B while it is locked. Confirm the local notification and full entry in the debug screen.
8. Fill in this result: **trigger retained: TBD; sender token retained: TBD; body token retained: TBD; background intent called: TBD**.

## Go or no-go rule

- **Proceed** only if both sender and full body arrive for all required transports with no confirmation tap, and the second phone can be set up reliably.
- **Proceed with caveats** if the capture works but each roommate must recreate a small device-specific automation after importing the shared shortcut.
- **Dead end** if an unfiltered Message trigger cannot be created, the trigger does not expose both sender and full body, locked execution requires a tap, or the transport behavior is incomplete for the product's required message types.
