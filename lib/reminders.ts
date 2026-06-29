export type ReminderPriority = "urgent" | "important" | "normal";

export type ReminderMetric = {
  label: string;
  value: string;
  caption: string;
  tone?: "danger" | "success";
};

export type Reminder = {
  id: string;
  daysLeft: number;
  title: string;
  subject: string;
  category: string;
  priority: ReminderPriority;
};

export const reminderMetrics: ReminderMetric[] = [
  {
    label: "Offen gesamt",
    value: "7",
    caption: "aktive Erinnerungen",
  },
  {
    label: "Dringend",
    value: "2",
    caption: "< 7 Tage fällig",
    tone: "danger",
  },
  {
    label: "Erledigt",
    value: "1",
    caption: "diese Sitzung",
    tone: "success",
  },
  {
    label: "Nächste Frist",
    value: "3",
    caption: "Tage · P. Schäfer",
    tone: "danger",
  },
];

export const reminderFilters = [
  "Alle (7)",
  "Dringend (2)",
  "Verträge (2)",
  "Schulungen (1)",
  "Allgemein (3)",
];

export const reminders: Reminder[] = [
  {
    id: "paul-schaefer-wiedereingliederung",
    daysLeft: 3,
    title: "Wiedereingliederung prüfen",
    subject: "Paul Schäfer · München",
    category: "Allgemein",
    priority: "urgent",
  },
  {
    id: "mehmet-yildiz-vertrag",
    daysLeft: 6,
    title: "Befristeter Vertrag läuft ab",
    subject: "Mehmet Yildiz · München",
    category: "Verträge",
    priority: "urgent",
  },
  {
    id: "anna-kowalski-fuehrungszeugnis",
    daysLeft: 11,
    title: "Führungszeugnis erneuern",
    subject: "Anna Kowalski · Berlin",
    category: "Dokumente",
    priority: "important",
  },
  {
    id: "team-empfang-erste-hilfe",
    daysLeft: 18,
    title: "Erste-Hilfe-Schulung fällig",
    subject: "Team Empfang · Hamburg",
    category: "Schulungen",
    priority: "normal",
  },
  {
    id: "lena-fischer-probezeit",
    daysLeft: 27,
    title: "Probezeit-Ende",
    subject: "Lena Fischer · München",
    category: "Verträge",
    priority: "important",
  },
  {
    id: "ole-petersen-urlaub",
    daysLeft: 32,
    title: "Urlaubsanspruch prüfen",
    subject: "Ole Petersen · Hamburg",
    category: "Allgemein",
    priority: "normal",
  },
  {
    id: "sara-neumann-jahresgespraech",
    daysLeft: 45,
    title: "Jahresgespräch planen",
    subject: "Sara Neumann · Berlin",
    category: "Allgemein",
    priority: "normal",
  },
];

export const reminderPriorityConfig = {
  urgent: {
    label: "Dringend",
    daysClassName: "text-danger",
    badgeClassName: "bg-danger/10 text-danger font-semibold",
    rowClassName: "border-danger/25",
  },
  important: {
    label: "Wichtig",
    daysClassName: "text-[#7A4E00]",
    badgeClassName: "bg-warning/10 text-[#7A4E00] font-semibold",
    rowClassName: "border-border",
  },
  normal: {
    label: "Normal",
    daysClassName: "text-muted-2",
    badgeClassName: "bg-border-soft text-muted",
    rowClassName: "border-border",
  },
} satisfies Record<
  ReminderPriority,
  {
    label: string;
    daysClassName: string;
    badgeClassName: string;
    rowClassName: string;
  }
>;
