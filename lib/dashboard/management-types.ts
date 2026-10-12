import type {
  SalesStage,
  CurrentSolution,
  CustomerSatisfaction,
  FeedbackReason,
} from "@/lib/db/schema";

export type ManagementPeriodKey = "today" | "week" | "month" | "30d";

export interface ManagementDashboardPeriod {
  key: ManagementPeriodKey;
  label: string;
  start: string; // ISO string in UTC
  end: string;   // ISO string in UTC
}

export interface ManagementDashboardActivity {
  contacts: number;
  visits: number;
  phoneCalls: number;
  offers: number;
  wins: number;
  losses: number;
  conversionRate: number | null; // e.g. 64.7 for 64.7%, null if wins + losses === 0
}

export interface ManagementFollowUpItem {
  id: string;
  marketId: string;
  marketName: string;
  district: string | null;
  salesStage: SalesStage;
  dueAt: string;
  overdueDays: number;
  assignedUserId: string | null;
  assignedUserName: string;
}

export interface ManagementFollowUps {
  overdue: number;
  dueToday: number;
  dueThisWeek: number;
  overdueItems: ManagementFollowUpItem[];
}

export type ManagementPipeline = Record<SalesStage, number>;

export interface ManagementEmployeePerformance {
  id: string;
  name: string;
  email: string;
  role: "admin" | "field_user";
  assignedCustomers: number;
  contacts: number;
  visits: number;
  phoneCalls: number;
  wins: number;
  losses: number;
  overdueFollowUps: number;
  wonSalesValue: number;
}

export interface ManagementInterestDistribution {
  hoch: number;
  mittel: number;
  niedrig: number;
  kein_interesse: number;
}

export interface ManagementFeedbackReasonItem {
  reason: FeedbackReason;
  label: string;
  count: number;
}

export type ManagementSolutionDistribution = Record<CurrentSolution, number>;

export type ManagementSatisfactionDistribution = Record<CustomerSatisfaction, number>;

export interface ManagementDashboardData {
  period: ManagementDashboardPeriod;
  activity: ManagementDashboardActivity;
  followUps: ManagementFollowUps;
  pipeline: ManagementPipeline;
  employees: ManagementEmployeePerformance[];
  interestDistribution: ManagementInterestDistribution;
  feedbackReasons: ManagementFeedbackReasonItem[];
  solutionDistribution: ManagementSolutionDistribution;
  satisfactionDistribution: ManagementSatisfactionDistribution;
  wonSalesValue: number | null;
}

/**
 * Berechnet die Conversion Rate als:
 * Gewonnen / (Gewonnen + Verloren)
 * für im ausgewählten Zeitraum abgeschlossene Vorgänge.
 * Gibt null zurück, wenn keine Abschlüsse vorliegen.
 * Ergebnis ist ein Prozentwert auf 1 Nachkommastelle gerundet (z.B. 64.7 für 64.7%).
 */
export function computeConversionRate(wins: number, losses: number): number | null {
  const terminalTotal = wins + losses;
  if (terminalTotal <= 0) {
    return null;
  }
  return Math.round((wins / terminalTotal) * 1000) / 10;
}
