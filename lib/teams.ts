export type TeamMember = {
  initials: string;
  name: string;
  location: string;
  role: string;
  contract: string;
  status: "on-duty" | "vacation";
  isLead?: boolean;
};

export type Team = {
  id: string;
  name: string;
  locations: string;
  colorClassName: string;
  members: TeamMember[];
  lead: TeamMember;
};

export const teams: Team[] = [
  {
    id: "verkauf",
    name: "Verkauf",
    locations: "München, Berlin, Hamburg",
    colorClassName: "bg-[#C9622A]",
    members: [
      {
        initials: "SW",
        name: "Sophie Wagner",
        location: "München",
        role: "Kassiererin",
        contract: "Unbefristet",
        status: "on-duty",
        isLead: true,
      },
      {
        initials: "MK",
        name: "Mara Klein",
        location: "München",
        role: "Kassiererin",
        contract: "Teilzeit",
        status: "on-duty",
      },
      {
        initials: "LF",
        name: "Lena Fischer",
        location: "München",
        role: "Aushilfe",
        contract: "Werkstudentin",
        status: "vacation",
      },
      {
        initials: "SN",
        name: "Sara Neumann",
        location: "Berlin",
        role: "Verk\u00e4uferin",
        contract: "Teilzeit",
        status: "vacation",
      },
      {
        initials: "NA",
        name: "Nina Albrecht",
        location: "Hamburg",
        role: "Verk\u00e4uferin",
        contract: "Teilzeit",
        status: "vacation",
      },
    ],
    lead: {
      initials: "SW",
      name: "Sophie Wagner",
      location: "München",
      role: "Kassiererin",
      contract: "Unbefristet",
      status: "on-duty",
      isLead: true,
    },
  },
  {
    id: "service",
    name: "Service",
    locations: "München, Berlin, Hamburg",
    colorClassName: "bg-[#2A5BC9]",
    members: [
      {
        initials: "MY",
        name: "Mehmet Yildiz",
        location: "Berlin",
        role: "Serviceleitung",
        contract: "Unbefristet",
        status: "on-duty",
        isLead: true,
      },
      {
        initials: "DR",
        name: "David Roth",
        location: "Hamburg",
        role: "Servicekraft",
        contract: "Teilzeit",
        status: "on-duty",
      },
      {
        initials: "ED",
        name: "Elif Demir",
        location: "München",
        role: "Servicekraft",
        contract: "Unbefristet",
        status: "vacation",
      },
      {
        initials: "LM",
        name: "Lukas Maier",
        location: "Berlin",
        role: "Aushilfe",
        contract: "Minijob",
        status: "vacation",
      },
    ],
    lead: {
      initials: "MY",
      name: "Mehmet Yildiz",
      location: "Berlin",
      role: "Serviceleitung",
      contract: "Unbefristet",
      status: "on-duty",
      isLead: true,
    },
  },
  {
    id: "logistik",
    name: "Logistik",
    locations: "München, Hamburg",
    colorClassName: "bg-[#1D8A65]",
    members: [
      {
        initials: "JB",
        name: "Jonas Becker",
        location: "Hamburg",
        role: "Logistikleitung",
        contract: "Unbefristet",
        status: "on-duty",
        isLead: true,
      },
      {
        initials: "PS",
        name: "Paul Sch\u00e4fer",
        location: "München",
        role: "Lagerist",
        contract: "Vollzeit",
        status: "on-duty",
      },
      {
        initials: "OP",
        name: "Ole Petersen",
        location: "Hamburg",
        role: "Fahrer",
        contract: "Teilzeit",
        status: "vacation",
      },
    ],
    lead: {
      initials: "JB",
      name: "Jonas Becker",
      location: "Hamburg",
      role: "Logistikleitung",
      contract: "Unbefristet",
      status: "on-duty",
      isLead: true,
    },
  },
  {
    id: "empfang",
    name: "Empfang",
    locations: "Berlin, Hamburg",
    colorClassName: "bg-[#7A3C9C]",
    members: [
      {
        initials: "AK",
        name: "Anna Kowalski",
        location: "Berlin",
        role: "Empfang",
        contract: "Teilzeit",
        status: "vacation",
      },
      {
        initials: "GV",
        name: "Greta Voss",
        location: "Hamburg",
        role: "Empfangsleitung",
        contract: "Unbefristet",
        status: "on-duty",
        isLead: true,
      },
    ],
    lead: {
      initials: "GV",
      name: "Greta Voss",
      location: "Hamburg",
      role: "Empfangsleitung",
      contract: "Unbefristet",
      status: "on-duty",
      isLead: true,
    },
  },
];

const totalMembers = teams.reduce(
  (total, team) => total + team.members.length,
  0,
);

export const teamMetrics = [
  {
    label: "Teams gesamt",
    value: teams.length.toString(),
    caption: "aktive Gruppen",
  },
  {
    label: "Mitglieder",
    value: totalMembers.toString(),
    caption: "alle Standorte",
  },
  {
    label: "\u00d8 Teamgr\u00f6\u00dfe",
    value: (totalMembers / teams.length).toFixed(1),
    caption: "Mitglieder je Team",
  },
  {
    label: "Vakante Stellen",
    value: "2",
    caption: "München \u00b7 Frühschicht",
    tone: "danger",
  },
] satisfies Array<{
  label: string;
  value: string;
  caption: string;
  tone?: "danger";
}>;

export const teamAssignableEmployees: TeamMember[] = [
  {
    initials: "CB",
    name: "Carla Brandt",
    location: "München",
    role: "HR-Leitung",
    contract: "Unbefristet",
    status: "on-duty",
  },
  {
    initials: "TW",
    name: "Tobias Weber",
    location: "Berlin",
    role: "Schichtleitung",
    contract: "Vollzeit",
    status: "on-duty",
  },
  {
    initials: "LK",
    name: "Lea Krüger",
    location: "Hamburg",
    role: "Aushilfe",
    contract: "Minijob",
    status: "vacation",
  },
];

export function getTeamById(id: string) {
  return teams.find((team) => team.id === id);
}
