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
}

export interface PaymentLog {
  memberId: string;
  amount: number;
  date: string;
  transactionRef: string;
  senderAccountName?: string;
  verifiedByAI: boolean;
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
}

export interface ChatMessage {
  id: string;
  senderName: string;
  senderRole: "admin" | "member" | "bot";
  text: string;
  image?: string; // base64 attachment
  timestamp: string;
}
