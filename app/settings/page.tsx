import Link from "next/link";
import { redirect } from "next/navigation";

import {
  confirmBoardProfileAction,
  createBoardInvitationAction,
  leaveBoardAction,
  removeBoardMemberAction,
  signOutAction,
  updateBoardMetadataAction,
  updateBoardProfileSettingsAction,
  updateLinkedMemberProfileAction,
  updateSettingsAction,
} from "@/app/actions";
import { BoardInvitePanel } from "@/components/board-invite-panel";
import { getCurrentAppUser } from "@/lib/auth";
import { isAppEnabled } from "@/lib/app-mode";
import { getBoardPageData, getRecentBoardsForUser } from "@/lib/board-data";
import { isOperatorUser } from "@/lib/operator-access";
import { getRuntimeStatus } from "@/lib/runtime-status";

function csv(values: string[]) {
  return values.join(", ");
}

function runtimeLabel(value: boolean) {
  return value ? "Ready" : "Needs setup";
}

function formatStatusTimestamp(value: string | null) {
  if (!value) return "Not available";
  return new Date(value).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
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
  const isOperator = isOperatorUser(currentUser);
  const runtime = getRuntimeStatus();
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
            <div className="home-badge">Workspace settings</div>
            <h1>Manage your identity, shared workspace details, and collaborator preferences.</h1>
            <p>
              Homeboard keeps the shared chat focused on the search itself. This page is where you step in when you want to
              edit account details, tighten the brief, or manage who is part of the workspace.
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
            {isOperator ? (
              <>
                <h2>Runtime status</h2>
                <p className="settings-help-copy">
                  This is the external beta operator view. It shows which systems are truly wired, which ones are still using
                  local fallbacks, and what would block a live tester from getting the full experience.
                </p>
                <div className="account-form-grid account-form-grid-2">
                  <article className="invite-summary-card">
                    <div className="invite-summary-head">
                      <div>
                        <strong>App gate</strong>
                        <span>{runtime.appEnabled ? "Public app surface is enabled" : "App is currently disabled"}</span>
                      </div>
                      <span>{runtime.appEnabled ? "Live" : "Off"}</span>
                    </div>
                    <p>Demo mode: {runtime.demoMode ? "On" : "Off"}</p>
                  </article>
                  <article className="invite-summary-card">
                    <div className="invite-summary-head">
                      <div>
                        <strong>Auth + data</strong>
                        <span>Supabase, admin access, and database wiring</span>
                      </div>
                      <span>{runtimeLabel(runtime.supabaseConfigured && runtime.supabaseAdminConfigured && runtime.databaseConfigured)}</span>
                    </div>
                    <p>Supabase client: {runtimeLabel(runtime.supabaseConfigured)}</p>
                    <p>Supabase admin: {runtimeLabel(runtime.supabaseAdminConfigured)}</p>
                    <p>Database URL: {runtimeLabel(runtime.databaseConfigured)}</p>
                  </article>
                  <article className="invite-summary-card">
                    <div className="invite-summary-head">
                      <div>
                        <strong>AI assistant</strong>
                        <span>Local Ollama stack currently backing onboarding and reasoning</span>
                      </div>
                      <span>{runtime.ollamaConfigured ? "Configured" : "Fallback defaults"}</span>
                    </div>
                    <p>Host: {runtime.ollamaUrl}</p>
                    <p>Base model: {runtime.ollamaModel}</p>
                    <p>Extract model: {runtime.ollamaExtractModel}</p>
                    <p>Reply model: {runtime.ollamaReplyModel}</p>
                  </article>
                  <article className="invite-summary-card">
                    <div className="invite-summary-head">
                      <div>
                        <strong>Commute engine</strong>
                        <span>Route timing for group commute tradeoff analysis</span>
                      </div>
                      <span>{runtime.commuteMode}</span>
                    </div>
                    <p>
                      {runtime.commuteMode === "live"
                        ? "OpenRouteService is configured, so live commute timing can run."
                        : runtime.commuteMode === "demo"
                          ? "Commute output is coming from deterministic demo logic right now."
                          : "Add OPENROUTESERVICE_API_KEY to unlock live commute timing."}
                    </p>
                  </article>
                </div>
                <div className="detail-chip-wrap">
                  <a href="/api/runtime-status" className="secondary-button" target="_blank" rel="noreferrer">
                    Open runtime JSON
                  </a>
                  <a href="/api/analytics/export" className="secondary-button">
                    Export analytics CSV
                  </a>
                </div>

                <div className="settings-divider" />
              </>
            ) : null}

            <h2>Your identity</h2>
            {error ? <div className="account-message account-message-error">{error}</div> : null}
            {notice ? <div className="account-message account-message-notice">{notice}</div> : null}
            <div className="account-form-grid account-form-grid-2">
              <article className="invite-summary-card">
                <div className="invite-summary-head">
                  <div>
                    <strong>Account trust</strong>
                    <span>{currentUser.emailConfirmedAt ? "Email-confirmed identity" : "Email confirmation still unclear"}</span>
                  </div>
                  <span>{currentUser.emailConfirmedAt ? "Confirmed" : "Check auth"}</span>
                </div>
                <p>Email: {currentUser.email}</p>
                <p>Confirmed: {formatStatusTimestamp(currentUser.emailConfirmedAt)}</p>
                <p>Last sign-in: {formatStatusTimestamp(currentUser.lastSignInAt)}</p>
              </article>
              <article className="invite-summary-card">
                <div className="invite-summary-head">
                  <div>
                    <strong>Account readiness</strong>
                    <span>What this identity can already contribute to the workspace</span>
                  </div>
                  <span>{currentUser.workAddress ? "Commute-ready" : "Needs anchor"}</span>
                </div>
                <p>Primary commute anchor: {currentUser.workAddress ?? "Not set yet"}</p>
                <p>Secondary commute anchor: {currentUser.secondaryWorkAddress ?? "Not set yet"}</p>
                <p>Auth provider{currentUser.authProviders.length === 1 ? "" : "s"}: {currentUser.authProviders.join(", ") || "email"}</p>
              </article>
            </div>
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
            <h2>Shared brief</h2>
            {recentBoards.length > 0 ? (
              <div className="account-form">
                <div className="field-stack">
                  <span>Workspace</span>
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
              <p className="settings-help-copy">Create a workspace first so the shared brief has somewhere real to live and evolve.</p>
            )}

            {boardData ? (
              <>
                {currentUser.id === boardData.board.userId ? (
                  <>
                    <div className="settings-subsection">
                      <h3>Workspace details</h3>
                      <p className="settings-help-copy">
                        Rename the workspace if the original onboarding title was too rough or no longer reflects what the group is actually searching for.
                      </p>
                      <form action={updateBoardMetadataAction} className="account-form">
                        <input type="hidden" name="boardId" value={boardData.board.id} />
                        <label className="field-stack">
                          <span>Workspace title</span>
                          <input name="title" defaultValue={boardData.board.title} placeholder="NYC grad roommate search" />
                        </label>
                        <button type="submit" className="account-primary-button">Save workspace details</button>
                      </form>
                    </div>

                    <div className="settings-divider" />
                  </>
                ) : null}

                {boardData.roommates.find((roommate) => roommate.linkedUserId === currentUser.id) ? (
                  <>
                    {(() => {
                      const currentRoommate = boardData.roommates.find((roommate) => roommate.linkedUserId === currentUser.id)!;
                      return (
                        <>
                          <div className="settings-subsection">
                            <h3>Your collaborator profile</h3>
                            <p className="settings-help-copy">
                              This is your personal point of view inside the shared search. Update it when your budget, commute tolerance, or neighborhood lean changes so the group read stays honest.
                            </p>
                            <form action={updateLinkedMemberProfileAction} className="account-form">
                              <input type="hidden" name="boardId" value={boardData.board.id} />
                              <div className="account-form-grid account-form-grid-2">
                                <label className="field-stack">
                                  <span>Work or commute address</span>
                                  <input name="workAddress" defaultValue={currentUser.workAddress ?? ""} placeholder="350 5th Ave, New York, NY" />
                                </label>
                                <label className="field-stack">
                                  <span>Monthly budget ceiling</span>
                                  <input name="budgetMax" defaultValue={currentRoommate.budgetMax ?? ""} inputMode="numeric" placeholder="1700" />
                                </label>
                                <label className="field-stack">
                                  <span>Commute target</span>
                                  <input name="commuteDestination" defaultValue={currentRoommate.commuteDestination ?? ""} placeholder="Midtown" />
                                </label>
                                <label className="field-stack">
                                  <span>Preferred neighborhoods</span>
                                  <input name="preferredNeighborhoods" defaultValue={csv(currentRoommate.preferredNeighborhoods)} placeholder="Astoria, Williamsburg" />
                                </label>
                                <label className="field-stack">
                                  <span>Must-haves</span>
                                  <input name="mustHaves" defaultValue={csv(currentRoommate.mustHaves)} placeholder="laundry, train access" />
                                </label>
                                <label className="field-stack">
                                  <span>Dealbreakers</span>
                                  <input name="dealbreakers" defaultValue={csv(currentRoommate.dealbreakers)} placeholder="over 1800, poor train access" />
                                </label>
                              </div>

                              <div className="account-toggle-grid">
                                <label className="field-stack">
                                  <span>Commute priority</span>
                                  <select name="commutePriority" defaultValue={currentRoommate.commutePriority}>
                                    <option value="low">Low</option>
                                    <option value="medium">Medium</option>
                                    <option value="high">High</option>
                                  </select>
                                </label>
                                <label className="field-stack">
                                  <span>Neighborhood priority</span>
                                  <select name="neighborhoodPriority" defaultValue={currentRoommate.neighborhoodPriority}>
                                    <option value="low">Low</option>
                                    <option value="medium">Medium</option>
                                    <option value="high">High</option>
                                  </select>
                                </label>
                                <label className="field-stack">
                                  <span>Space priority</span>
                                  <select name="spacePriority" defaultValue={currentRoommate.spacePriority}>
                                    <option value="low">Low</option>
                                    <option value="medium">Medium</option>
                                    <option value="high">High</option>
                                  </select>
                                </label>
                                <label className="field-stack">
                                  <span>Privacy priority</span>
                                  <select name="privacyPriority" defaultValue={currentRoommate.privacyPriority}>
                                    <option value="low">Low</option>
                                    <option value="medium">Medium</option>
                                    <option value="high">High</option>
                                  </select>
                                </label>
                              </div>

                              <label className="field-stack">
                                <span>Notes</span>
                                <textarea
                                  name="notes"
                                  rows={3}
                                  defaultValue={currentRoommate.notes ?? ""}
                                  placeholder="Example: I can give on neighborhood if the commute stays clean."
                                />
                              </label>
                              <button type="submit" className="account-primary-button">Save your collaborator profile</button>
                            </form>
                          </div>

                          <div className="settings-divider" />
                        </>
                      );
                    })()}
                  </>
                ) : null}

                <div className="settings-help-copy">
                  Shared brief status: <strong>{boardData.profile.completionStatus}</strong>
                  {` · ${boardData.completion.percentComplete}% complete · `}
                  {boardData.missingFields.length > 0 ? `Still open: ${boardData.missingFields.join(", ")}` : "The core search inputs are in place."}
                </div>
                {boardData.completion.completedFields.length > 0 ? (
                  <div className="settings-help-copy">
                    Already covered: {boardData.completion.completedFields.join(", ")}
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
                        <option value="">Not set yet</option>
                        <option value="true">Searching with roommates</option>
                        <option value="false">Searching solo</option>
                      </select>
                    </label>
                    <label className="field-stack">
                      <span>Pets</span>
                      <select name="pets" defaultValue={boardData.profile.pets === undefined ? "" : String(boardData.profile.pets)}>
                        <option value="">Not set yet</option>
                        <option value="true">Need pet-friendly</option>
                        <option value="false">No pets in the picture</option>
                      </select>
                    </label>
                    <label className="field-stack">
                      <span>Parking</span>
                      <select name="parking" defaultValue={boardData.profile.parking === undefined ? "" : String(boardData.profile.parking)}>
                        <option value="">Not set yet</option>
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
                        <option value="">Not set yet</option>
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
                        <option value="">Not set yet</option>
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
                        <option value="">Not set yet</option>
                        <option value="true">May need one</option>
                        <option value="false">Do not expect to need one</option>
                      </select>
                    </label>
                  </div>

                  <button type="submit" className="account-primary-button">Save shared brief</button>
                </form>

                <form action={confirmBoardProfileAction} className="account-form">
                  <input type="hidden" name="boardId" value={boardData.board.id} />
                  <button type="submit" className="secondary-button">Confirm shared brief</button>
                </form>

                <div className="settings-divider" />

                <div className="settings-subsection">
                  <h3>Collaborators</h3>
                  <p className="settings-help-copy">
                    These are the real people currently attached to the workspace. Remove someone here if the workspace was shared with the wrong person or the group changes.
                  </p>
                  <div className="invite-panel-list">
                    {boardData.members.map((member) => {
                      const isOwner = member.userId === boardData.board.userId;
                      return (
                        <article key={member.id} className="invite-summary-card">
                          <div className="invite-summary-head">
                            <div>
                              <strong>{member.user.displayName}</strong>
                              <span>{isOwner ? "Owner" : "Member"}</span>
                            </div>
                            {!isOwner ? (
                              <form action={removeBoardMemberAction}>
                                <input type="hidden" name="boardId" value={boardData.board.id} />
                                <input type="hidden" name="memberUserId" value={member.userId} />
                                <input type="hidden" name="redirectTo" value={`/settings?boardId=${boardData.board.id}`} />
                                <button type="submit" className="secondary-button">Remove</button>
                              </form>
                            ) : null}
                          </div>
                          <p className="settings-help-copy">{member.user.email}</p>
                          <p className="settings-help-copy">
                            Joined {new Date(member.joinedAt).toLocaleDateString()}
                            {member.user.workAddress ? ` · commute anchor: ${member.user.workAddress}` : ""}
                          </p>
                        </article>
                      );
                    })}
                  </div>
                </div>

                {currentUser.id !== boardData.board.userId ? (
                  <>
                    <div className="settings-divider" />
                    <div className="settings-subsection">
                      <h3>Leave this workspace</h3>
                      <p className="settings-help-copy">
                        If this is no longer your search group, you can leave the workspace here. Your collaborator profile, votes, and comments in this workspace will be removed.
                      </p>
                      <form action={leaveBoardAction} className="account-form">
                        <input type="hidden" name="boardId" value={boardData.board.id} />
                        <input type="hidden" name="redirectTo" value="/" />
                        <button type="submit" className="secondary-button">Leave workspace</button>
                      </form>
                    </div>
                  </>
                ) : null}

                <div className="settings-divider" />

                <div className="settings-subsection">
                  <h3>Workspace invites</h3>
                  <p className="settings-help-copy">
                    Invite collaborators by email, then send them the generated join link. Once they accept, they become a real
                    workspace member and can add their own commute and preference layer.
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

                  <BoardInvitePanel boardId={boardData.board.id} invitations={boardData.invitations} />
                </div>
              </>
            ) : null}
          </section>
        </div>
      </section>
    </main>
  );
}
