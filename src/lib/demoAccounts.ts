export interface DemoAccount {
  email: string;
  password: string;
  displayName: string;
  typeLabel: string;
}

export const DEMO_ACCOUNTS: DemoAccount[] = [
  {
    email: "buyer@seed.rozaris.demo",
    password: "1",
    displayName: "Elira Krasniqi",
    typeLabel: "User",
  },
  {
    email: "andi-hoxha@seed.rozaris.demo",
    password: "1",
    displayName: "Andi Hoxha",
    typeLabel: "Private Publisher",
  },
  {
    email: "vega-real-estate@seed.rozaris.demo",
    password: "1",
    displayName: "Vega Real Estate",
    typeLabel: "Business Publisher — Agency",
  },
  {
    email: "alba-construction@seed.rozaris.demo",
    password: "1",
    displayName: "ALBA Construction",
    typeLabel: "Business Publisher — Developer",
  },
  {
    email: "admin@rozaris.demo",
    password: "1",
    displayName: "Admin",
    typeLabel: "Admin",
  },
];
