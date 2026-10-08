export type Payment = 'cash' | 'card';

export interface Trip {
  id: string;
  start: string;
  end: string;
  amount: number;
  payment: Payment;
  commission: number;
}

export interface Summary {
  trip_count: number;
  revenue: number;
  commission: number;
  net: number;
  payment_breakdown: { cash: number; card: number };
}

export interface DayResponse {
  date: string;
  timezone: string;
  summary: Summary;
  trips: Trip[];
}

export interface TripResult {
  trip: Trip;
  duplicate: boolean;
}
