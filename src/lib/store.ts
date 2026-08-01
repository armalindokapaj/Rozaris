import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type {
  BuyerPreferences,
  BuyerProfile,
  CompareEntity,
  ConstructionTimelineDraft,
  ConstructionTimelineRequest,
  Conversation,
  Currency,
  FilterState,
  GeoPoint,
  Locale,
  MobileSheet,
  SavedSearch,
  ViewMode,
} from "./types";
import { DEMO_PUBLISHER, seedConversations } from "./mockData";

export const defaultBuyerPreferences: BuyerPreferences = {
  transaction: "buy",
  propertyTypes: [],
  priceMax: null,
  location: "Tirana, Albania",
};

// Default until an admin sets a real rate in the Admin Console.
export const DEFAULT_EUR_TO_ALL_RATE = 97;

export const defaultFilters: FilterState = {
  transaction: "buy",
  rentSubtype: undefined,
  location: "Tirana, Albania",
  propertyTypes: [],
  priceMin: null,
  priceMax: null,
  areaMin: null,
  areaMax: null,
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

interface AuthState {
  signedIn: boolean;
  name: string | null;
  role: "visitor" | "publisher" | "admin" | "buyer";
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
  signIn: (name: string, role?: AuthState["role"]) => void;
  signOut: () => void;

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
      signIn: (name, role = "visitor") =>
        set({ auth: { signedIn: true, name, role } }),
      signOut: () => set({ auth: { signedIn: false, name: null, role: "visitor" } }),

      currency: "EUR",
      setCurrency: (currency) => set({ currency }),
      locale: "sq",
      setLocale: (locale) => set({ locale }),

      eurToAllRate: DEFAULT_EUR_TO_ALL_RATE,
      eurToAllRateUpdatedAt: null,
      setEurToAllRate: (eurToAllRate, eurToAllRateUpdatedAt) =>
        set({ eurToAllRate, eurToAllRateUpdatedAt }),

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
      },
      rejectTimelineRequest: (requestId) => {
        set((s) => ({
          timelineRequests: s.timelineRequests.map((r) =>
            r.id === requestId ? { ...r, status: "rejected", reviewedAt: new Date().toISOString() } : r
          ),
        }));
      },
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
      }),
    }
  )
);
