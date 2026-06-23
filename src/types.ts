/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface Member {
  id: string;
  name: string;
  phone: string;
  bankName: string;
  accountNo: string;
  accountName: string;
  collectedMonths: string[]; // List of historical round IDs they have won/collected
  isActive: boolean;
  groupId?: string;
}

export interface PaymentLog {
  memberId: string;
  amount: number;
  date: string;
  transactionRef: string;
  senderAccountName?: string;
  verifiedByAI: boolean;
  recipientId?: string; // The specific winner member receiving this payment
  confirmedByRecipient?: boolean;
}

export interface ContributionMonth {
  id: string; // e.g. "2026-06"
  name: string; // e.g. "June 2026"
  targetAmountPerMember: number; // e.g. 50000
  recipientsCount: 1 | 2; // Can pick 1 or 2 members
  recipients: string[]; // Member IDs picked for this month
  status: "ACTIVE" | "COMPLETED";
  payments: PaymentLog[]; // Log of confirmed payments
  closingRemark?: string; // AI generated closing template
  payoutConfirmedByRecipients?: string[]; // List of winner IDs who confirmed bank receipt
}

export interface ChatMessage {
  id: string;
  senderName: string;
  senderRole: "admin" | "member" | "bot";
  text: string;
  image?: string; // base64 attachment
  timestamp: string;
}

// ==========================================
// REAL ESTATE POOL ENTITIES
// ==========================================

export interface DeveloperPartner {
  id: string;
  name: string;
  contactInfo: string;
  relationship: "family" | "referral" | "external";
  isVerified: boolean;
}

export interface PropertyListing {
  id: string;
  developerPartnerId: string;
  title: string;
  location: string;
  type: "land" | "off-plan" | "completed";
  totalPrice: number;
  currency: string; // e.g. "NGN" or "USD"
  titleStatus: string; // e.g. "C of O", "Governor's Consent", "Deed of Assignment"
  lawyerVerified: boolean;
  surveyorReport: string;
  documentLinks: string[];
  status: "available" | "funding" | "completed";
}

export interface PropertyMilestone {
  id: string;
  propertyId: string;
  title: string;
  releasePercentage: number; // e.g. 20 (meaning 20%)
  isVerified: boolean;
  evidenceUrl: string; // text description or mock photo/video link
  status: "pending" | "approved" | "released";
}

export interface RealEstatePool {
  id: string;
  groupId: string;
  propertyId: string;
  targetAmount: number;
  currency: string;
  deadline: string;
  escrowProvider: string;
  escrowAccountNo: string;
  status: "active" | "funded" | "milestone-released" | "completed";
}

export interface PoolContribution {
  id: string;
  poolId: string;
  memberId: string;
  amount: number;
  currency: string;
  verified: boolean;
  date: string;
}

export interface PoolFundRelease {
  id: string;
  poolId: string;
  milestoneId: string;
  amount: number;
  status: "proposed" | "approved" | "released";
}

export interface PoolReleaseApproval {
  id: string;
  releaseId: string;
  memberId: string;
  approved: boolean;
  date: string;
}

export interface PoolDispute {
  id: string;
  poolId: string;
  memberId: string;
  title: string;
  description: string;
  status: "open" | "resolved";
  date: string;
}

export interface OwnershipCertificate {
  id: string;
  poolId: string;
  memberId: string;
  documentLink: string; // reference/url to legal joint-deed documents
  notes: string;
}

