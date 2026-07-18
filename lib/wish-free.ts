export type WishFreeRequestStatus = "open" | "approved" | "rejected";

export type WishFreeFilter = WishFreeRequestStatus | "all";

export type WishFreeRequest = {
  id: string;
  dbId: string;
  employeeId: string;
  employeeName: string;
  role: string;
  location: string;
  date: string;
  dateLabel: string;
  status: WishFreeRequestStatus;
  reason: string;
  rejectReason?: string;
};
