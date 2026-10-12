import type {
  SalesStage,
  InterestLevel,
  CurrentSolution,
  CustomerSatisfaction,
} from "@/lib/db/schema";

export interface DashboardFollowUpItem {
  id: string;
  marketId: string;
  marketName: string;
  district: string | null;
  salesStage: SalesStage;
  dueAt: string;
  overdueDays?: number;
  label: string;
}

export interface DashboardHighPriorityCustomer {
  id: string;
  name: string;
  district: string | null;
  salesStage: SalesStage;
  interestLevel: InterestLevel | null;
  currentSolution: CurrentSolution;
  satisfaction: CustomerSatisfaction;
  lastContactAt: string | null;
  nextFollowUpDueAt: string | null;
}

export interface DashboardPipelineStats {
  neu: number;
  kontaktiert: number;
  interesse: number;
  angebot: number;
  gewonnen: number;
  verloren: number;
}

export interface DashboardWeeklyActivity {
  contacts: number;
  visits: number;
  phoneCalls: number;
  emails: number;
  offers: number;
  wins: number;
}

export interface EmployeeTodayDashboardData {
  dateFormatted: string;
  greeting: {
    salutation: string;
    userName: string;
  };
  summary: {
    overdueFollowUps: number;
    dueTodayFollowUps: number;
    assignedCustomers: number;
    highPriorityCustomers: number;
  };
  overdueFollowUps: DashboardFollowUpItem[];
  dueTodayFollowUps: DashboardFollowUpItem[];
  pipeline: DashboardPipelineStats;
  weeklyActivity: DashboardWeeklyActivity;
  highPriorityCustomers: DashboardHighPriorityCustomer[];
}
