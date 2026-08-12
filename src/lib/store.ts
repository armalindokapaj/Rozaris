import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type {
  AuditLogEntry,
  BuyerPreferences,
  BuyerProfile,
  CompareEntity,
  ConstructionTimelineDraft,
  ConstructionTimelineRequest,
  Conversation,
  Currency,
  FilterState,
  FollowState,
  GeoPoint,
  LeadStatus,
  Locale,
  MobileSheet,
  Project,
  Project3DConfig,
  ProjectDetailModel,
  ProjectMapModel,
  PublisherType,
  RecentlyViewedEntry,
  RecentlyViewedKind,
  SavedSearch,
  TeamMember,
  Unit,
  ViewMode,
} from "./types";
import { DEMO_PUBLISHER, seedConversations } from "./mockData";

/** Recently Viewed is bounded, not infinite storage (PRD_User §8.3/§20.7). */
const RECENTLY_VIEWED_MAX = 50;

export const defaultBuyerPreferences: BuyerPreferences = {
  transaction: "buy",
  propertyTypes: [],
  priceMax: null,
  location: "Tirana, Albania",
};

// Default until an admin sets a real rate in the Admin Console.
export const DEFAULT_EUR_TO_ALL_RATE = 97;

/** PRD_3D_Project_Viewer §11/§15/§16 — applied until an Admin configures a
 * project's own "3D Experience". Distances are relative multipliers of the
 * project's auto-computed bounding radius (lib/threeBuilding.ts), so they
 * stay sensible whether a project is one small building or a large complex. */
export const defaultProject3DConfig: Project3DConfig = {
  lightingPreset: "daylight",
  backgroundPreset: "sky",
  groundEnabled: true,
  cameraStartDistanceMultiplier: 1,
  cameraMinDistanceMultiplier: 0.4,
  cameraMaxDistanceMultiplier: 2.5,
  cameraMaxPolarDeg: 85,
  autoRotate: true,
  constructionStagesEnabled: true,
  status: "published",
  renderingMode: "auto",
  qualityPreset: "high_desktop",
  glassPreset: "standard",
  skyPreset: "clear_day",
  environmentIntensity: 1,
  northRotationDeg: 0,
  defaultTimeOfDay: 14,
  allowUserTimeChange: true,
  cameraFovDesktop: 38,
  cameraFovMobile: 48,
  updatedAt: "2025-01-01T00:00:00.000Z",
};

/** Applied to a project the moment Admin uploads a GLB, before they've
 * touched any placement slider. 1:1 scale, no rotation/altitude correction —
 * intentionally naive so the preview grid immediately shows whether the
 * source file needs correcting. Starts disabled: an upload alone shouldn't
 * go live on the public map until Admin explicitly enables it. */
export const defaultProjectMapModel: ProjectMapModel = {
  glbUrl: "",
  fileName: "",
  fileSize: 0,
  scale: 1,
  rotationDeg: 0,
  altitudeOffset: 0,
  enabled: false,
  hideBaseBuilding: false,
  hiddenBuildingLng: null,
  hiddenBuildingLat: null,
  updatedAt: "",
};

/** Applied the moment Admin uploads the Project 3D Experience's detailed
 * GLB (Project3DConfigEditor's "Detailed Model" section), before touching
 * any placement slider or linking a single unit box — same "starts
 * disabled" reasoning as defaultProjectMapModel above. */
export const defaultProjectDetailModel: ProjectDetailModel = {
  glbUrl: "",
  fileName: "",
  fileSize: 0,
  scale: 1,
  rotationDeg: 0,
  altitudeOffset: 0,
  enabled: false,
  updatedAt: "",
  unitLinks: [],
};

export const defaultFilters: FilterState = {
  transaction: "buy",
  rentSubtype: undefined,
  location: "Tirana, Albania",
  propertyTypes: [],
  priceMin: null,
  priceMax: null,
  areaMin: null,
  areaMax: null,
  landAreaMin: null,
  landAreaMax: null,
  buildingPermit: false,
  bedrooms: null,
  bathrooms: null,
  condition: [],
  amenities: [],
  essentialPOIs: [],
  verifiedOnly: false,
  premiumOnly: false,
  projectsOnly: false,
  sort: "recommended",
};

export interface MapBounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

export interface AuthState {
  signedIn: boolean;
  name: string | null;
  role: "visitor" | "publisher" | "admin" | "buyer";
  /** Only meaningful when role === "publisher" — which of the three
   * PRD account types (Private Publisher / Real Estate Business / Developer)
   * this identity is, per PRD_Authentication_Account_Selection §7. */
  orgType?: PublisherType;
  /** The mock Publisher record (src/lib/mockData.ts) this identity's
   * listings/projects are drawn from. */
  publisherId?: string;
}

interface SavedState {
  listings: string[];
  projects: string[];
  neighborhoods: string[];
}

interface AppState {
  // Layout / navigation
  mode: ViewMode;
  setMode: (mode: ViewMode) => void;
  mobileSheet: MobileSheet;
  setMobileSheet: (sheet: MobileSheet) => void;

  // Filters
  filters: FilterState;
  setFilters: (partial: Partial<FilterState>) => void;
  setTransaction: (transaction: FilterState["transaction"]) => void;
  resetFilters: () => void;

  // Map / selection
  mapBounds: MapBounds | null;
  setMapBounds: (bounds: MapBounds) => void;
  /** Bounds committed only when the visitor explicitly chooses Search here. */
  mapAreaSearchBounds: MapBounds | null;
  searchThisMapArea: () => void;
  clearMapAreaSearch: () => void;
  selectedListingId: string | null;
  selectedProjectId: string | null;
  hoveredId: string | null;
  selectListing: (id: string | null) => void;
  selectProject: (id: string | null) => void;
  setHovered: (id: string | null) => void;
  flyToToken: number;
  flyToTarget: (GeoPoint & { zoom?: number }) | null;
  requestFlyTo: (target?: GeoPoint & { zoom?: number }) => void;

  // Compare (CMP-001..006)
  compare: CompareEntity[];
  compareReplaceCandidate: CompareEntity | null;
  addCompare: (item: CompareEntity) => void;
  removeCompareAt: (index: number) => void;
  confirmReplace: (index: number) => void;
  cancelReplace: () => void;
  clearCompare: () => void;
  compareOverlayOpen: boolean;
  setCompareOverlayOpen: (open: boolean) => void;

  // Saved content (BR-019: requires signed-in)
  saved: SavedState;
  toggleSavedListing: (id: string) => void;
  toggleSavedProject: (id: string) => void;
  toggleSavedNeighborhood: (id: string) => void;
  savedSearches: SavedSearch[];
  addSavedSearch: (search: SavedSearch) => void;

  // Auth (mock — phone OTP is out of scope for the frontend prototype)
  auth: AuthState;
  signIn: (
    name: string,
    role?: AuthState["role"],
    orgType?: AuthState["orgType"],
    publisherId?: string
  ) => void;
  signOut: () => void;
  signInModalOpen: boolean;
  openSignIn: () => void;
  closeSignIn: () => void;

  // Following: projects & developers (PRD_User §11). Followed neighborhoods
  // reuse saved.neighborhoods above — Save and Follow are the same action
  // for a neighborhood, since a neighborhood has no individual "save" target.
  following: FollowState;
  toggleFollowProject: (id: string) => void;
  toggleFollowDeveloper: (id: string) => void;

  // Recently Viewed (PRD_User §8) — bounded history, newest first.
  recentlyViewed: RecentlyViewedEntry[];
  trackView: (kind: RecentlyViewedKind, id: string) => void;
  removeRecentlyViewed: (kind: RecentlyViewedKind, id: string) => void;
  clearRecentlyViewed: () => void;

  // Notifications (PRD_User §13, PRD_Business_Publisher §22, PRD_Private_Publisher §10.4)
  // — the notification *content* is generated per-session from mockActivity.ts;
  // only read-state persists, keyed by notification id.
  readNotificationIds: string[];
  markNotificationRead: (id: string) => void;
  markAllNotificationsRead: (ids: string[]) => void;

  // Publisher leads (PRD_Business_Publisher §16, PRD_Private_Publisher §8)
  // — lead content is generated per-session from mockActivity.ts; only
  // status overrides persist, keyed by lead id.
  leadStatusOverrides: Record<string, LeadStatus>;
  setLeadStatus: (id: string, status: LeadStatus) => void;
  leadNotes: Record<string, string>;
  setLeadNotes: (id: string, notes: string) => void;

  // Admin audit trail (PRD_ROZARIS_User_Types §5 "Admin roles & audit") — a
  // session-local stand-in for a real AuditLog table; sensitive admin
  // actions in this prototype (approvals, publish toggles, rate changes)
  // call logAudit so the Audit Log tab has real, growing content instead of
  // seeded copy. Becomes the real Prisma AuditLog model in the backend-
  // wiring phase (see the Rozaris backend plan memory).
  auditLog: AuditLogEntry[];
  logAudit: (action: string, entity: string) => void;

  // Business Publisher company team roster (PRD_ROZARIS_User_Types §4
  // "Company & team") — informational only in this prototype (no real
  // per-seat permissions yet), keyed by publisherId.
  teamMembers: Record<string, TeamMember[]>;
  setTeamMembers: (publisherId: string, members: TeamMember[]) => void;

  // Locale / currency
  currency: Currency;
  setCurrency: (c: Currency) => void;
  locale: Locale;
  setLocale: (l: Locale) => void;

  // EUR -> ALL exchange rate — set manually by an admin in the Admin Console
  // (not fetched from any external source), rounded to a whole number (ALL
  // has no meaningful decimal usage). Applies to every listing/project price
  // shown in ALL immediately.
  eurToAllRate: number;
  eurToAllRateUpdatedAt: string | null;
  setEurToAllRate: (rate: number, updatedAt: string) => void;

  // Onboarding (Section 25.1)
  onboardingDismissed: boolean;
  dismissOnboarding: () => void;

  // Buyer account: profile + saved-preference feed
  buyerProfile: BuyerProfile | null;
  setBuyerProfile: (profile: BuyerProfile) => void;
  updateBuyerPreferences: (partial: Partial<BuyerPreferences>) => void;

  // Buyer <-> Seller messaging (mock — nothing is delivered off-device)
  conversations: Conversation[];
  sendMessage: (conversationId: string, text: string) => void;

  // Construction timeline edits: a publisher's draft only affects what's
  // shown on the live project (projectConstructionOverrides) once an admin
  // approves the request.
  timelineRequests: ConstructionTimelineRequest[];
  projectConstructionOverrides: Record<string, ConstructionTimelineDraft>;
  submitTimelineRequest: (projectId: string, projectName: string, draft: ConstructionTimelineDraft) => void;
  approveTimelineRequest: (requestId: string) => void;
  rejectTimelineRequest: (requestId: string) => void;

  // Admin-created projects (3D Experience tab §11 "Overview" -> a project
  // must exist before Admin can author its scene/units/model). Kept
  // separate from lib/mockData's seeded `projects` array — merged with it
  // wherever the Admin console lists projects — since the seed data is a
  // static module-level constant, not store state.
  customProjects: Project[];
  addProject: (project: Project) => void;
  addProjectUnit: (projectId: string, unit: Unit) => void;
  removeProjectUnit: (projectId: string, unitId: string) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      mode: "map",
      setMode: (mode) => set({ mode }),
      mobileSheet: "listings",
      setMobileSheet: (mobileSheet) => set({ mobileSheet }),

      filters: defaultFilters,
      setFilters: (partial) =>
        set((s) => ({ filters: { ...s.filters, ...partial } })),
      // Buy and rent use entirely different price/area slider scales, so a
      // value picked under one is meaningless (and out of range) under the
      // other — switching transaction always clears them.
      setTransaction: (transaction) =>
        set((s) => ({
          filters: {
            ...s.filters,
            transaction,
            projectsOnly: false,
            priceMin: null,
            priceMax: null,
            areaMin: null,
            areaMax: null,
          },
        })),
      resetFilters: () => set({ filters: defaultFilters }),

      mapBounds: null,
      setMapBounds: (mapBounds) => set({ mapBounds }),
      mapAreaSearchBounds: null,
      searchThisMapArea: () =>
        set((s) => ({ mapAreaSearchBounds: s.mapBounds ? { ...s.mapBounds } : null })),
      clearMapAreaSearch: () => set({ mapAreaSearchBounds: null }),
      selectedListingId: null,
      selectedProjectId: null,
      hoveredId: null,
      selectListing: (id) =>
        set({ selectedListingId: id, selectedProjectId: null }),
      selectProject: (id) =>
        set({ selectedProjectId: id, selectedListingId: null }),
      setHovered: (id) => set({ hoveredId: id }),
      flyToToken: 0,
      flyToTarget: null,
      requestFlyTo: (target) =>
        set((s) => ({ flyToToken: s.flyToToken + 1, flyToTarget: target ?? s.flyToTarget })),

      compare: [],
      compareReplaceCandidate: null,
      addCompare: (item) => {
        const current = get().compare;
        const alreadyIn = current.some((c) =>
          c.kind === "listing" && item.kind === "listing"
            ? c.entity.id === item.entity.id
            : c.kind === "unit" && item.kind === "unit"
            ? c.entity.id === item.entity.id
            : false
        );
        if (alreadyIn) return;
        if (current.length < 2) {
          set({ compare: [...current, item] });
        } else {
          // CMP-001: never silently replace — prompt user
          set({ compareReplaceCandidate: item });
        }
      },
      removeCompareAt: (index) =>
        set((s) => ({ compare: s.compare.filter((_, i) => i !== index) })),
      confirmReplace: (index) => {
        const candidate = get().compareReplaceCandidate;
        if (!candidate) return;
        set((s) => {
          const next = [...s.compare];
          next[index] = candidate;
          return { compare: next, compareReplaceCandidate: null };
        });
      },
      cancelReplace: () => set({ compareReplaceCandidate: null }),
      clearCompare: () => set({ compare: [], compareReplaceCandidate: null }),
      compareOverlayOpen: false,
      setCompareOverlayOpen: (compareOverlayOpen) => set({ compareOverlayOpen }),

      saved: { listings: [], projects: [], neighborhoods: [] },
      toggleSavedListing: (id) =>
        set((s) => ({
          saved: {
            ...s.saved,
            listings: s.saved.listings.includes(id)
              ? s.saved.listings.filter((x) => x !== id)
              : [...s.saved.listings, id],
          },
        })),
      toggleSavedProject: (id) =>
        set((s) => ({
          saved: {
            ...s.saved,
            projects: s.saved.projects.includes(id)
              ? s.saved.projects.filter((x) => x !== id)
              : [...s.saved.projects, id],
          },
        })),
      toggleSavedNeighborhood: (id) =>
        set((s) => ({
          saved: {
            ...s.saved,
            neighborhoods: s.saved.neighborhoods.includes(id)
              ? s.saved.neighborhoods.filter((x) => x !== id)
              : [...s.saved.neighborhoods, id],
          },
        })),
      savedSearches: [],
      addSavedSearch: (search) =>
        set((s) => ({ savedSearches: [search, ...s.savedSearches] })),

      auth: { signedIn: false, name: null, role: "visitor" },
      signIn: (name, role = "visitor", orgType, publisherId) =>
        set({
          auth: { signedIn: true, name, role, orgType, publisherId },
          signInModalOpen: false,
        }),
      signOut: () => set({ auth: { signedIn: false, name: null, role: "visitor" } }),
      signInModalOpen: false,
      openSignIn: () => set({ signInModalOpen: true }),
      closeSignIn: () => set({ signInModalOpen: false }),

      following: { projects: [], developers: [] },
      toggleFollowProject: (id) =>
        set((s) => ({
          following: {
            ...s.following,
            projects: s.following.projects.includes(id)
              ? s.following.projects.filter((x) => x !== id)
              : [...s.following.projects, id],
          },
        })),
      toggleFollowDeveloper: (id) =>
        set((s) => ({
          following: {
            ...s.following,
            developers: s.following.developers.includes(id)
              ? s.following.developers.filter((x) => x !== id)
              : [...s.following.developers, id],
          },
        })),

      recentlyViewed: [],
      trackView: (kind, id) =>
        set((s) => {
          const withoutThis = s.recentlyViewed.filter((e) => !(e.kind === kind && e.id === id));
          const next = [{ kind, id, viewedAt: new Date().toISOString() }, ...withoutThis];
          return { recentlyViewed: next.slice(0, RECENTLY_VIEWED_MAX) };
        }),
      removeRecentlyViewed: (kind, id) =>
        set((s) => ({
          recentlyViewed: s.recentlyViewed.filter((e) => !(e.kind === kind && e.id === id)),
        })),
      clearRecentlyViewed: () => set({ recentlyViewed: [] }),

      readNotificationIds: [],
      markNotificationRead: (id) =>
        set((s) =>
          s.readNotificationIds.includes(id)
            ? s
            : { readNotificationIds: [...s.readNotificationIds, id] }
        ),
      markAllNotificationsRead: (ids) =>
        set((s) => ({ readNotificationIds: Array.from(new Set([...s.readNotificationIds, ...ids])) })),

      leadStatusOverrides: {},
      setLeadStatus: (id, status) => {
        set((s) => ({ leadStatusOverrides: { ...s.leadStatusOverrides, [id]: status } }));
        get().logAudit(`Lead status → ${status}`, id);
      },
      leadNotes: {},
      setLeadNotes: (id, notes) =>
        set((s) => ({ leadNotes: { ...s.leadNotes, [id]: notes } })),

      auditLog: [],
      logAudit: (action, entity) =>
        set((s) => ({
          auditLog: [
            {
              id: `audit-${Date.now()}-${Math.round(Math.random() * 1e6)}`,
              actor: s.auth.name ?? "Admin",
              action,
              entity,
              createdAt: new Date().toISOString(),
            },
            ...s.auditLog,
          ].slice(0, 200),
        })),

      teamMembers: {},
      setTeamMembers: (publisherId, members) =>
        set((s) => ({ teamMembers: { ...s.teamMembers, [publisherId]: members } })),

      currency: "EUR",
      setCurrency: (currency) => set({ currency }),
      locale: "sq",
      setLocale: (locale) => set({ locale }),

      eurToAllRate: DEFAULT_EUR_TO_ALL_RATE,
      eurToAllRateUpdatedAt: null,
      setEurToAllRate: (eurToAllRate, eurToAllRateUpdatedAt) => {
        set({ eurToAllRate, eurToAllRateUpdatedAt });
        get().logAudit("Platform setting changed", `EUR → ALL rate = ${eurToAllRate}`);
      },

      onboardingDismissed: false,
      dismissOnboarding: () => set({ onboardingDismissed: true }),

      buyerProfile: null,
      setBuyerProfile: (buyerProfile) => set({ buyerProfile }),
      updateBuyerPreferences: (partial) =>
        set((s) =>
          s.buyerProfile
            ? { buyerProfile: { ...s.buyerProfile, preferences: { ...s.buyerProfile.preferences, ...partial } } }
            : s
        ),

      conversations: seedConversations,
      sendMessage: (conversationId, text) => {
        const trimmed = text.trim();
        if (!trimmed) return;
        const { auth, buyerProfile } = get();
        const isBuyer = auth.role === "buyer";
        const senderId = isBuyer ? buyerProfile?.id ?? "buyer-unknown" : DEMO_PUBLISHER.id;
        const senderName = isBuyer ? buyerProfile?.name ?? auth.name ?? "Buyer" : auth.name ?? DEMO_PUBLISHER.name;
        set((s) => ({
          conversations: s.conversations.map((c) =>
            c.id === conversationId
              ? {
                  ...c,
                  messages: [
                    ...c.messages,
                    {
                      id: `${conversationId}-m${c.messages.length + 1}-${Date.now()}`,
                      senderId,
                      senderName,
                      senderRole: isBuyer ? "buyer" : "publisher",
                      text: trimmed,
                      createdAt: new Date().toISOString(),
                    },
                  ],
                }
              : c
          ),
        }));
      },

      timelineRequests: [],
      projectConstructionOverrides: {},
      submitTimelineRequest: (projectId, projectName, draft) => {
        const request: ConstructionTimelineRequest = {
          id: `timeline-${projectId}-${Date.now()}`,
          projectId,
          projectName,
          publisherId: DEMO_PUBLISHER.id,
          publisherName: DEMO_PUBLISHER.name,
          draft,
          status: "pending",
          submittedAt: new Date().toISOString(),
        };
        set((s) => ({ timelineRequests: [request, ...s.timelineRequests] }));
      },
      approveTimelineRequest: (requestId) => {
        const request = get().timelineRequests.find((r) => r.id === requestId);
        if (!request) return;
        set((s) => ({
          timelineRequests: s.timelineRequests.map((r) =>
            r.id === requestId ? { ...r, status: "approved", reviewedAt: new Date().toISOString() } : r
          ),
          projectConstructionOverrides: {
            ...s.projectConstructionOverrides,
            [request.projectId]: request.draft,
          },
        }));
        get().logAudit("Construction update approved", request.projectName);
      },
      rejectTimelineRequest: (requestId) => {
        const request = get().timelineRequests.find((r) => r.id === requestId);
        set((s) => ({
          timelineRequests: s.timelineRequests.map((r) =>
            r.id === requestId ? { ...r, status: "rejected", reviewedAt: new Date().toISOString() } : r
          ),
        }));
        if (request) get().logAudit("Construction update rejected", request.projectName);
      },

      customProjects: [],
      addProject: (project) =>
        set((s) => ({ customProjects: [...s.customProjects, project] })),
      addProjectUnit: (projectId, unit) =>
        set((s) => ({
          customProjects: s.customProjects.map((p) =>
            p.id === projectId
              ? {
                  ...p,
                  units: [...p.units, unit],
                  totalUnits: p.totalUnits + 1,
                  availableUnits:
                    unit.status === "available" ? p.availableUnits + 1 : p.availableUnits,
                }
              : p
          ),
        })),
      removeProjectUnit: (projectId, unitId) =>
        set((s) => ({
          customProjects: s.customProjects.map((p) => {
            if (p.id !== projectId) return p;
            const removed = p.units.find((u) => u.id === unitId);
            return {
              ...p,
              units: p.units.filter((u) => u.id !== unitId),
              totalUnits: Math.max(0, p.totalUnits - 1),
              availableUnits:
                removed?.status === "available"
                  ? Math.max(0, p.availableUnits - 1)
                  : p.availableUnits,
            };
          }),
        })),
    }),
    {
      name: "rozaris-store",
      storage: createJSONStorage(() => localStorage),
      skipHydration: true,
      partialize: (s) => ({
        saved: s.saved,
        savedSearches: s.savedSearches,
        auth: s.auth,
        currency: s.currency,
        locale: s.locale,
        onboardingDismissed: s.onboardingDismissed,
        compare: s.compare,
        eurToAllRate: s.eurToAllRate,
        eurToAllRateUpdatedAt: s.eurToAllRateUpdatedAt,
        buyerProfile: s.buyerProfile,
        conversations: s.conversations,
        timelineRequests: s.timelineRequests,
        projectConstructionOverrides: s.projectConstructionOverrides,
        customProjects: s.customProjects,
        following: s.following,
        recentlyViewed: s.recentlyViewed,
        readNotificationIds: s.readNotificationIds,
        leadStatusOverrides: s.leadStatusOverrides,
        leadNotes: s.leadNotes,
        auditLog: s.auditLog,
        teamMembers: s.teamMembers,
      }),
    }
  )
);
