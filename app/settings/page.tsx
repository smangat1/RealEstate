import Link from "next/link";
import { redirect } from "next/navigation";

import {
  confirmBoardProfileAction,
  createBoardInvitationAction,
  signOutAction,
  updateBoardProfileSettingsAction,
  updateSettingsAction,
} from "@/app/actions";
import { BoardInvitePanel } from "@/components/board-invite-panel";
import { getCurrentAppUser } from "@/lib/auth";
import { isAppEnabled } from "@/lib/app-mode";
import { getBoardPageData, getRecentBoardsForUser } from "@/lib/board-data";

function csv(values: string[]) {
  return values.join(", ");
}

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (!isAppEnabled()) {
    redirect("/?notice=Settings%20for%20the%20private%20board%20app%20are%20currently%20hidden%20outside%20dev%20mode.");
  }
  const currentUser = await getCurrentAppUser();
  if (!currentUser) {
    redirect("/");
  }

  const params = await searchParams;
  const notice = typeof params.notice === "string" ? params.notice : "";
  const error = typeof params.error === "string" ? params.error : "";
  const recentBoards = await getRecentBoardsForUser(currentUser.id, 12);
  const selectedBoardId =
    typeof params.boardId === "string" && recentBoards.some((board) => board.id === params.boardId)
      ? params.boardId
      : recentBoards[0]?.id;
  const boardData = selectedBoardId ? await getBoardPageData(selectedBoardId, currentUser.id) : null;

  return (
    <main className="settings-shell">
      <section className="settings-page-card mac-window-card">
        <div className="settings-header">
          <div>
            <div className="home-badge">Settings</div>
            <h1>Manage your account identity and manually tune the rental profile outside the chat.</h1>
            <p>
              The board chat stays focused on onboarding conversation. This page is where you step in directly to tweak stored
              preferences, commute anchors, and confirmation state.
            </p>
          </div>
          <div className="settings-header-actions">
            <form action={signOutAction}>
              <button type="submit" className="secondary-button">Sign out</button>
            </form>
            <Link href={selectedBoardId ? `/boards/${selectedBoardId}` : "/"} className="secondary-button">
              Back
            </Link>
          </div>
        </div>

        <div className="settings-grid">
          <section className="settings-section">
            <h2>Your account</h2>
            {error ? <div className="account-message account-message-error">{error}</div> : null}
            {notice ? <div className="account-message account-message-notice">{notice}</div> : null}
            <form action={updateSettingsAction} className="account-form">
              <label className="field-stack">
                <span>Name</span>
                <input name="displayName" defaultValue={currentUser.displayName} placeholder="Your name" />
              </label>
              <label className="field-stack">
                <span>Email</span>
                <input value={currentUser.email} disabled readOnly />
              </label>
              <label className="field-stack">
                <span>Primary commute destination</span>
                <input
                  name="workAddress"
                  defaultValue={currentUser.workAddress ?? ""}
                  placeholder="Office, campus, or main weekday destination"
                />
              </label>
              <label className="field-stack">
                <span>Secondary commute destination</span>
                <input
                  name="secondaryWorkAddress"
                  defaultValue={currentUser.secondaryWorkAddress ?? ""}
                  placeholder="Optional second destination"
                />
              </label>
              <button type="submit" className="account-primary-button">Save account settings</button>
            </form>
          </section>

          <section className="settings-section">
            <h2>Board profile</h2>
            {recentBoards.length > 0 ? (
              <div className="account-form">
                <div className="field-stack">
                  <span>Board</span>
                  <div className="detail-chip-wrap">
                    {recentBoards.map((board) => (
                      <Link
                        key={board.id}
                        href={`/settings?boardId=${board.id}`}
                        className={board.id === selectedBoardId ? "saved-pill" : "secondary-button"}
                      >
                        {board.title}
                      </Link>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <p className="settings-help-copy">Create a board first so chat can start building a profile you can refine here.</p>
            )}

            {boardData ? (
              <>
                <div className="settings-help-copy">
                  Status: <strong>{boardData.profile.completionStatus}</strong>
                  {` · ${boardData.completion.percentComplete}% complete · `}
                  {boardData.missingFields.length > 0 ? `Missing: ${boardData.missingFields.join(", ")}` : "Core onboarding fields are covered."}
                </div>
                {boardData.completion.completedFields.length > 0 ? (
                  <div className="settings-help-copy">
                    Completed: {boardData.completion.completedFields.join(", ")}
                  </div>
                ) : null}

                <form action={updateBoardProfileSettingsAction} className="account-form">
                  <input type="hidden" name="boardId" value={boardData.board.id} />

                  <div className="account-form-grid account-form-grid-2">
                    <label className="field-stack">
                      <span>Name</span>
                      <input name="name" defaultValue={boardData.profile.name} placeholder="Who this profile is for" />
                    </label>
                    <label className="field-stack">
                      <span>City</span>
                      <input name="city" defaultValue={boardData.profile.city ?? boardData.profile.locations[0] ?? ""} placeholder="New York City" />
                    </label>
                    <label className="field-stack">
                      <span>Move-in date</span>
                      <input name="moveInDate" defaultValue={boardData.profile.moveInDate ?? boardData.profile.moveInTimeframe ?? ""} placeholder="August" />
                    </label>
                    <label className="field-stack">
                      <span>Group size</span>
                      <input name="groupSize" defaultValue={boardData.profile.groupSize ?? ""} inputMode="numeric" placeholder="3" />
                    </label>
                    <label className="field-stack">
                      <span>Budget min</span>
                      <input name="budgetMin" defaultValue={boardData.profile.budgetMin ?? ""} inputMode="numeric" placeholder="1400" />
                    </label>
                    <label className="field-stack">
                      <span>Budget max</span>
                      <input name="budgetMax" defaultValue={boardData.profile.budgetMax ?? ""} inputMode="numeric" placeholder="1600" />
                    </label>
                    <label className="field-stack">
                      <span>Stretch budget</span>
                      <input name="stretchBudget" defaultValue={boardData.profile.stretchBudget ?? ""} inputMode="numeric" placeholder="1750" />
                    </label>
                    <label className="field-stack">
                      <span>Commute target</span>
                      <input name="commuteTarget" defaultValue={boardData.profile.commuteTarget ?? ""} placeholder="Midtown" />
                    </label>
                    <label className="field-stack">
                      <span>Max commute (minutes)</span>
                      <input name="maxCommuteMinutes" defaultValue={boardData.profile.maxCommuteMinutes ?? ""} inputMode="numeric" placeholder="40" />
                    </label>
                    <label className="field-stack">
                      <span>Preferred neighborhoods</span>
                      <input name="neighborhoods" defaultValue={csv(boardData.profile.neighborhoods)} placeholder="Astoria, Williamsburg" />
                    </label>
                    <label className="field-stack">
                      <span>Must-haves</span>
                      <input name="mustHaves" defaultValue={csv(boardData.profile.mustHaves)} placeholder="laundry, sunlight" />
                    </label>
                    <label className="field-stack">
                      <span>Nice-to-haves</span>
                      <input name="niceToHaves" defaultValue={csv(boardData.profile.niceToHaves)} placeholder="gym, balcony" />
                    </label>
                    <label className="field-stack">
                      <span>Dealbreakers</span>
                      <input name="dealbreakers" defaultValue={csv(boardData.profile.dealbreakers)} placeholder="broker fee, ground floor" />
                    </label>
                    <label className="field-stack">
                      <span>Priorities</span>
                      <input name="priorities" defaultValue={csv(boardData.profile.priorities)} placeholder="commute, neighborhood, price" />
                    </label>
                  </div>

                  <div className="account-toggle-grid">
                    <label className="field-stack">
                      <span>Roommate status</span>
                      <select name="hasRoommates" defaultValue={boardData.profile.hasRoommates === undefined ? "" : String(boardData.profile.hasRoommates)}>
                        <option value="">Unknown</option>
                        <option value="true">Searching with roommates</option>
                        <option value="false">Searching solo</option>
                      </select>
                    </label>
                    <label className="field-stack">
                      <span>Pets</span>
                      <select name="pets" defaultValue={boardData.profile.pets === undefined ? "" : String(boardData.profile.pets)}>
                        <option value="">Unknown</option>
                        <option value="true">Need pet-friendly</option>
                        <option value="false">No pets in the picture</option>
                      </select>
                    </label>
                    <label className="field-stack">
                      <span>Parking</span>
                      <select name="parking" defaultValue={boardData.profile.parking === undefined ? "" : String(boardData.profile.parking)}>
                        <option value="">Unknown</option>
                        <option value="true">Need parking</option>
                        <option value="false">Do not need parking</option>
                      </select>
                    </label>
                  </div>

                  <div className="account-toggle-grid">
                    <label className="field-stack">
                      <span>Offer letter</span>
                      <select
                        name="hasOfferLetter"
                        defaultValue={boardData.profile.rentalReadiness?.hasOfferLetter === undefined ? "" : String(boardData.profile.rentalReadiness?.hasOfferLetter)}
                      >
                        <option value="">Unknown</option>
                        <option value="true">Ready</option>
                        <option value="false">Not ready</option>
                      </select>
                    </label>
                    <label className="field-stack">
                      <span>Proof of income</span>
                      <select
                        name="hasProofOfIncome"
                        defaultValue={boardData.profile.rentalReadiness?.hasProofOfIncome === undefined ? "" : String(boardData.profile.rentalReadiness?.hasProofOfIncome)}
                      >
                        <option value="">Unknown</option>
                        <option value="true">Ready</option>
                        <option value="false">Not ready</option>
                      </select>
                    </label>
                    <label className="field-stack">
                      <span>Guarantor</span>
                      <select
                        name="needsGuarantor"
                        defaultValue={boardData.profile.rentalReadiness?.needsGuarantor === undefined ? "" : String(boardData.profile.rentalReadiness?.needsGuarantor)}
                      >
                        <option value="">Unknown</option>
                        <option value="true">May need one</option>
                        <option value="false">Do not expect to need one</option>
                      </select>
                    </label>
                  </div>

                  <button type="submit" className="account-primary-button">Save board profile</button>
                </form>

                <form action={confirmBoardProfileAction} className="account-form">
                  <input type="hidden" name="boardId" value={boardData.board.id} />
                  <button type="submit" className="secondary-button">Confirm this profile</button>
                </form>

                <div className="settings-divider" />

                <div className="settings-subsection">
                  <h3>Board invites</h3>
                  <p className="settings-help-copy">
                    Invite collaborators by email, then send them the generated join link. Once they accept, they become a real
                    board member and can finish their own profile.
                  </p>
                  <form action={createBoardInvitationAction} className="account-form">
                    <input type="hidden" name="boardId" value={boardData.board.id} />
                    <input type="hidden" name="redirectTo" value={`/settings?boardId=${boardData.board.id}`} />
                    <label className="field-stack">
                      <span>Invite by email</span>
                      <input name="email" type="email" placeholder="roommate@example.com" />
                    </label>
                    <button type="submit" className="account-primary-button">Generate invite link</button>
                  </form>

                  <BoardInvitePanel invitations={boardData.invitations} />
                </div>
              </>
            ) : null}
          </section>
        </div>
      </section>
    </main>
  );
}
