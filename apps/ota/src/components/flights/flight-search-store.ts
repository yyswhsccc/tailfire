'use client';

import { create } from 'zustand';
import {
  DEFAULT_FILTERS,
  type FlightFilters,
  type SortOption,
} from '@/lib/flight-utils';

// ---------------------------------------------------------------------------
// Domain types
// ---------------------------------------------------------------------------

export interface FlightOffer {
  id: string;
  source: string;
  segments: Array<{
    departure: { iataCode: string; terminal?: string; at: string };
    arrival: { iataCode: string; terminal?: string; at: string };
    carrier: string;
    carrierName?: string;
    flightNumber: string;
    aircraft?: string;
    duration: string;
    stops: number;
    cabin?: string;
  }>;
  price: {
    currency: string;
    total: string;
    perTraveler: string;
    base?: string;
  };
  validatingAirline: string;
  fareClass?: string;
  fareFamily?: string;
  cabin?: string;
  fareRules?: { exchangeable: boolean; refundable: boolean };
  baggageAllowance?: {
    checked?: { quantity: number; weight?: string };
    cabin?: { quantity: number };
  };
}

export interface PriceDate {
  date: string;
  price: number;
  currency: string;
}

export interface PriceMetrics {
  min: number;
  firstQuartile: number;
  median: number;
  thirdQuartile: number;
  max: number;
  currencyCode: string;
}

export interface DirectDestination {
  iataCode: string;
  name: string;
  type: string;
}

export interface DelayPrediction {
  onTimePercentage: number;
  delayLevel: string;
}

// ---------------------------------------------------------------------------
// Store types
// ---------------------------------------------------------------------------

export type TripType = 'round-trip' | 'one-way';
export type RoundTripStep = 'outbound' | 'return' | 'confirm';

interface FlightSearchState {
  // -- Search params --------------------------------------------------------
  tripType: TripType;
  origin: string;
  destination: string;
  departureDate: string;
  returnDate: string;
  adults: number;
  children: number;
  travelClass: string;

  // -- Results --------------------------------------------------------------
  outboundResults: FlightOffer[];
  returnResults: FlightOffer[];
  isSearching: boolean;
  searchError: string | null;

  // -- Enrichment -----------------------------------------------------------
  priceDates: PriceDate[];
  priceDatesLoading: boolean;
  priceMetrics: PriceMetrics | null;
  priceMetricsLoading: boolean;
  directDestinations: DirectDestination[];
  directDestinationsLoading: boolean;
  delayPredictions: Map<string, DelayPrediction>;
  upsellOffers: FlightOffer[];
  upsellLoading: boolean;

  // -- Filters & Sort -------------------------------------------------------
  sort: SortOption;
  filters: FlightFilters;

  // -- Round-trip flow ------------------------------------------------------
  roundTripStep: RoundTripStep;
  selectedOutbound: FlightOffer | null;
  selectedReturn: FlightOffer | null;

  // -- Checkout -------------------------------------------------------------
  showRequestForm: boolean;

  // -- Actions: setters -----------------------------------------------------
  setTripType: (v: TripType) => void;
  setOrigin: (v: string) => void;
  setDestination: (v: string) => void;
  setDepartureDate: (v: string) => void;
  setReturnDate: (v: string) => void;
  setAdults: (v: number) => void;
  setChildren: (v: number) => void;
  setTravelClass: (v: string) => void;

  setOutboundResults: (v: FlightOffer[]) => void;
  setReturnResults: (v: FlightOffer[]) => void;
  setIsSearching: (v: boolean) => void;
  setSearchError: (v: string | null) => void;

  setPriceDates: (v: PriceDate[]) => void;
  setPriceDatesLoading: (v: boolean) => void;
  setPriceMetrics: (v: PriceMetrics | null) => void;
  setPriceMetricsLoading: (v: boolean) => void;
  setDirectDestinations: (v: DirectDestination[]) => void;
  setDirectDestinationsLoading: (v: boolean) => void;
  setDelayPredictions: (v: Map<string, DelayPrediction>) => void;
  setUpsellOffers: (v: FlightOffer[]) => void;
  setUpsellLoading: (v: boolean) => void;

  setSort: (v: SortOption) => void;
  setFilters: (v: FlightFilters) => void;

  setRoundTripStep: (v: RoundTripStep) => void;
  setSelectedOutbound: (v: FlightOffer | null) => void;
  setSelectedReturn: (v: FlightOffer | null) => void;

  setShowRequestForm: (v: boolean) => void;

  // -- Actions: compound ----------------------------------------------------
  setSearchParams: (params: {
    origin: string;
    destination: string;
    departureDate: string;
    returnDate: string;
    adults: number;
    children: number;
    travelClass: string;
  }) => void;
  swapAirports: () => void;
  selectOutbound: (offer: FlightOffer) => void;
  selectReturn: (offer: FlightOffer) => void;
  changeOutbound: () => void;
  changeReturn: () => void;
  resetFilters: () => void;
  reset: () => void;
}

// ---------------------------------------------------------------------------
// Store implementation
// ---------------------------------------------------------------------------

export const useFlightSearch = create<FlightSearchState>((set) => ({
  // -- Search params --------------------------------------------------------
  tripType: 'round-trip',
  origin: '',
  destination: '',
  departureDate: '',
  returnDate: '',
  adults: 1,
  children: 0,
  travelClass: 'ECONOMY',

  // -- Results --------------------------------------------------------------
  outboundResults: [],
  returnResults: [],
  isSearching: false,
  searchError: null,

  // -- Enrichment -----------------------------------------------------------
  priceDates: [],
  priceDatesLoading: false,
  priceMetrics: null,
  priceMetricsLoading: false,
  directDestinations: [],
  directDestinationsLoading: false,
  delayPredictions: new Map(),
  upsellOffers: [],
  upsellLoading: false,

  // -- Filters & Sort -------------------------------------------------------
  sort: 'best',
  filters: { ...DEFAULT_FILTERS },

  // -- Round-trip flow ------------------------------------------------------
  roundTripStep: 'outbound',
  selectedOutbound: null,
  selectedReturn: null,

  // -- Checkout -------------------------------------------------------------
  showRequestForm: false,

  // -- Actions: setters -----------------------------------------------------
  setTripType: (v) => set({ tripType: v }),
  setOrigin: (v) => set({ origin: v }),
  setDestination: (v) => set({ destination: v }),
  setDepartureDate: (v) => set({ departureDate: v }),
  setReturnDate: (v) => set({ returnDate: v }),
  setAdults: (v) => set({ adults: v }),
  setChildren: (v) => set({ children: v }),
  setTravelClass: (v) => set({ travelClass: v }),

  setOutboundResults: (v) => set({ outboundResults: v }),
  setReturnResults: (v) => set({ returnResults: v }),
  setIsSearching: (v) => set({ isSearching: v }),
  setSearchError: (v) => set({ searchError: v }),

  setPriceDates: (v) => set({ priceDates: v }),
  setPriceDatesLoading: (v) => set({ priceDatesLoading: v }),
  setPriceMetrics: (v) => set({ priceMetrics: v }),
  setPriceMetricsLoading: (v) => set({ priceMetricsLoading: v }),
  setDirectDestinations: (v) => set({ directDestinations: v }),
  setDirectDestinationsLoading: (v) => set({ directDestinationsLoading: v }),
  setDelayPredictions: (v) => set({ delayPredictions: v }),
  setUpsellOffers: (v) => set({ upsellOffers: v }),
  setUpsellLoading: (v) => set({ upsellLoading: v }),

  setSort: (v) => set({ sort: v }),
  setFilters: (v) => set({ filters: v }),

  setRoundTripStep: (v) => set({ roundTripStep: v }),
  setSelectedOutbound: (v) => set({ selectedOutbound: v }),
  setSelectedReturn: (v) => set({ selectedReturn: v }),

  setShowRequestForm: (v) => set({ showRequestForm: v }),

  // -- Actions: compound ----------------------------------------------------
  setSearchParams: (params) =>
    set({
      origin: params.origin,
      destination: params.destination,
      departureDate: params.departureDate,
      returnDate: params.returnDate,
      adults: params.adults,
      children: params.children,
      travelClass: params.travelClass,
    }),

  swapAirports: () =>
    set((s) => ({ origin: s.destination, destination: s.origin })),

  selectOutbound: (offer) =>
    set({ selectedOutbound: offer, roundTripStep: 'return' }),

  selectReturn: (offer) =>
    set({ selectedReturn: offer, roundTripStep: 'confirm' }),

  changeOutbound: () =>
    set({
      selectedOutbound: null,
      selectedReturn: null,
      roundTripStep: 'outbound',
    }),

  changeReturn: () =>
    set({
      selectedReturn: null,
      roundTripStep: 'return',
    }),

  resetFilters: () => set({ filters: { ...DEFAULT_FILTERS } }),

  reset: () =>
    set({
      // Results
      outboundResults: [],
      returnResults: [],
      isSearching: false,
      searchError: null,
      // Enrichment
      priceDates: [],
      priceDatesLoading: false,
      priceMetrics: null,
      priceMetricsLoading: false,
      directDestinations: [],
      directDestinationsLoading: false,
      delayPredictions: new Map(),
      upsellOffers: [],
      upsellLoading: false,
      // Filters & Sort
      sort: 'best',
      filters: { ...DEFAULT_FILTERS },
      // Round-trip
      roundTripStep: 'outbound' as RoundTripStep,
      selectedOutbound: null,
      selectedReturn: null,
      // Checkout
      showRequestForm: false,
    }),
}));
