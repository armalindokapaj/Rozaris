// ROZARIS Rent vs Buy — calculation engine (PRD_Rent_vs_Buy.pdf v1.0, §7-9,
// §14, §21). Pure, deterministic, no framework/DOM dependency — the same
// module backs both the live client-side recalculation (§11: ~150-300ms
// after each input change) and the /api/tools/rent-vs-buy/calculate route,
// so there is exactly one implementation of the math (§15: "do not
// maintain two independent implementations").
//
// Monthly simulation over the holding period, per §7's own formulas:
//  - fixed-rate fully amortizing mortgage (§7.1)
//  - property value compounds monthly from the annual appreciation rate (§7.3)
//  - rent escalates once per anniversary, not monthly (§7.4's recommendation)
//  - the renter's un-spent down payment + closing costs seed an investment
//    account (§7.5) that also picks up the monthly saved difference
//    whenever renting is cheaper that month (never an automatic withdrawal
//    when buying is cheaper — §7.5)
//  - net financial position, not just cumulative cash, is what's compared
//    (§7.7): buy_net = recovered_cash_at_sale - cumulative_buyer_cash;
//    rent_net = investment_account + refundable_deposit - cumulative_rent_cost
//
// Every field name here maps directly to §14's data model (camelCased).

export const RENT_VS_BUY_METHODOLOGY_VERSION = "1.0.0";

export interface RentBuyScenario {
  currency: "EUR" | "ALL";
  locationText: string;
  holdingPeriodYears: number; // 1-30
  rentMonthly: number;
  rentGrowthAnnual: number; // fraction, e.g. 0.03
  renterInsuranceMonthly: number;
  securityDepositMonths: number;
  depositRefundable: boolean;
  renterMovingCosts: number; // one-time, at move-in
  propertyPrice: number;
  downPaymentPercent: number; // fraction, e.g. 0.2
  mortgageRateAnnual: number; // fraction
  loanTermYears: number; // 5-40
  homeAppreciationAnnual: number; // fraction, may be negative
  propertyTaxRateAnnual: number; // fraction of value / year
  homeInsuranceMonthly: number;
  maintenanceRateAnnual: number; // fraction of value / year
  hoaMonthly: number;
  purchaseClosingCostRate: number; // fraction of price
  sellingCostRate: number; // fraction of sale price
  investmentReturnAnnual: number; // fraction
  investmentFeeDragAnnual: number; // fraction, subtracted from return
}

export interface RentBuySeriesPoint {
  year: number;
  /** Null after planned stay: rent has ended and must not be extrapolated. */
  rentNet: number | null;
  buyNet: number;
  outstandingMortgageBalance: number;
}

export interface RentBuyBreakdown {
  rent: {
    rentPaid: number;
    renterInsurance: number;
    movingCosts: number;
    depositTreatment: number; // positive = returned to renter, 0 if refundable (nets out), negative if lost
    investmentContributions: number;
    investmentGrowth: number;
    finalInvestmentAccount: number;
    netPosition: number;
  };
  buy: {
    downPayment: number;
    purchaseClosingCosts: number;
    mortgagePrincipal: number;
    mortgageInterest: number;
    propertyTax: number;
    insurance: number;
    maintenance: number;
    hoaFees: number;
    sellingCosts: number;
    homeValueAtExit: number;
    cashRecoveredAtSale: number;
    netPosition: number;
  };
}

export interface RentBuyResult {
  methodologyVersion: string;
  holdingPeriodYears: number;
  firstMonthRentCost: number;
  firstMonthBuyCost: number;
  rentNetPosition: number;
  buyNetPosition: number;
  winner: "rent" | "buy" | "tie";
  advantageAmount: number;
  /** null when no durable break-even occurs within the horizon. */
  breakEvenMonth: number | null;
  annualSeries: RentBuySeriesPoint[];
  mortgagePayoffYear: number;
  estimatedEquityAtStay: number;
  breakdown: RentBuyBreakdown;
}

const BREAK_EVEN_CONFIRMATION_MONTHS = 6; // PRD §9 recommends 6-12

function leaderAt(rentNet: number, buyNet: number): "rent" | "buy" | "tie" {
  if (Math.abs(buyNet - rentNet) < 0.01) return "tie";
  return buyNet > rentNet ? "buy" : "rent";
}

export function calculateRentVsBuy(scenario: RentBuyScenario): RentBuyResult {
  const months = Math.round(scenario.holdingPeriodYears * 12);
  const loanTermMonths = Math.round(scenario.loanTermYears * 12);
  const chartMonths = Math.max(months, loanTermMonths);

  const downPaymentAmount = scenario.propertyPrice * scenario.downPaymentPercent;
  const closingCosts = scenario.propertyPrice * scenario.purchaseClosingCostRate;
  const loanPrincipal = Math.max(0, scenario.propertyPrice - downPaymentAmount);

  const monthlyMortgageRate = scenario.mortgageRateAnnual / 12;
  const monthlyPayment =
    loanPrincipal <= 0
      ? 0
      : monthlyMortgageRate === 0
      ? loanPrincipal / loanTermMonths
      : (loanPrincipal * monthlyMortgageRate * Math.pow(1 + monthlyMortgageRate, loanTermMonths)) /
        (Math.pow(1 + monthlyMortgageRate, loanTermMonths) - 1);

  const monthlyAppreciation = Math.pow(1 + scenario.homeAppreciationAnnual, 1 / 12) - 1;
  const monthlyInvestmentReturn =
    Math.pow(1 + Math.max(0, scenario.investmentReturnAnnual - scenario.investmentFeeDragAnnual), 1 / 12) - 1;

  let loanBalance = loanPrincipal;
  let propertyValue = scenario.propertyPrice;
  let currentRent = scenario.rentMonthly;
  let investmentAccount = downPaymentAmount + closingCosts;

  let cumulativeRentPaid = 0;
  let cumulativeRenterInsurance = 0;
  let cumulativeInvestmentContributions = investmentAccount;
  let cumulativeMortgagePrincipal = 0;
  let cumulativeMortgageInterest = 0;
  let cumulativePropertyTax = 0;
  let cumulativeHomeInsurance = 0;
  let cumulativeMaintenance = 0;
  let cumulativeHOA = 0;
  let cumulativeBuyerCash = downPaymentAmount + closingCosts;

  const depositAmount = scenario.rentMonthly * scenario.securityDepositMonths;
  if (!scenario.depositRefundable) {
    cumulativeRentPaid += depositAmount; // a real, non-recoverable cost
  }
  cumulativeRentPaid += scenario.renterMovingCosts;

  let firstMonthRentCost = 0;
  let firstMonthBuyCost = 0;

  const monthlyLeader: ("rent" | "buy" | "tie")[] = [];
  const annualSeries: RentBuySeriesPoint[] = [];

  // Year 0 — the instant-exit baseline before any month has elapsed.
  {
    const sellingCosts0 = propertyValue * scenario.sellingCostRate;
    const buyNet0 = propertyValue - sellingCosts0 - loanBalance - cumulativeBuyerCash;
    const rentNet0 = investmentAccount - cumulativeRentPaid;
    annualSeries.push({ year: 0, rentNet: rentNet0, buyNet: buyNet0, outstandingMortgageBalance: loanBalance });
  }

  for (let m = 1; m <= chartMonths; m++) {
    if (m <= months && m > 1 && (m - 1) % 12 === 0) {
      currentRent *= 1 + scenario.rentGrowthAnnual;
    }

    let interestPortion = 0;
    let principalPortion = 0;
    if (m <= loanTermMonths && loanBalance > 0.01) {
      interestPortion = loanBalance * monthlyMortgageRate;
      principalPortion = Math.min(monthlyPayment - interestPortion, loanBalance);
      loanBalance = Math.max(0, loanBalance - principalPortion);
    }
    cumulativeMortgageInterest += interestPortion;
    cumulativeMortgagePrincipal += principalPortion;

    propertyValue *= 1 + monthlyAppreciation;

    const monthlyPropertyTax = (propertyValue * scenario.propertyTaxRateAnnual) / 12;
    const monthlyMaintenance = (propertyValue * scenario.maintenanceRateAnnual) / 12;
    cumulativePropertyTax += monthlyPropertyTax;
    cumulativeMaintenance += monthlyMaintenance;
    cumulativeHomeInsurance += scenario.homeInsuranceMonthly;
    cumulativeHOA += scenario.hoaMonthly;

    const buyMonthlyCost =
      interestPortion +
      principalPortion +
      scenario.homeInsuranceMonthly +
      scenario.hoaMonthly +
      monthlyPropertyTax +
      monthlyMaintenance;
    cumulativeBuyerCash += buyMonthlyCost;

    const rentMonthlyCost = m <= months ? currentRent + scenario.renterInsuranceMonthly : 0;
    if (m <= months) {
      cumulativeRentPaid += currentRent;
      cumulativeRenterInsurance += scenario.renterInsuranceMonthly;
    }

    investmentAccount *= 1 + monthlyInvestmentReturn;
    const diff = buyMonthlyCost - rentMonthlyCost;
    if (diff > 0) {
      investmentAccount += diff;
      cumulativeInvestmentContributions += diff;
    }

    if (m === 1) {
      firstMonthRentCost = rentMonthlyCost;
      firstMonthBuyCost = buyMonthlyCost;
    }

    const sellingCostsAtM = propertyValue * scenario.sellingCostRate;
    const buyNetAtM = propertyValue - sellingCostsAtM - loanBalance - cumulativeBuyerCash;
    const refundableDeposit = scenario.depositRefundable ? depositAmount : 0;
    const rentNetAtM = investmentAccount + refundableDeposit - cumulativeRentPaid - cumulativeRenterInsurance;

    if (m <= months) monthlyLeader.push(leaderAt(rentNetAtM, buyNetAtM));

    if (m % 12 === 0) {
      annualSeries.push({ year: m / 12, rentNet: m <= months ? rentNetAtM : null, buyNet: buyNetAtM, outstandingMortgageBalance: loanBalance });
    }
  }

  // Durable break-even: earliest month whose leader holds for the
  // confirmation window (or through the end of the horizon) — §9.
  let breakEvenMonth: number | null = null;
  for (let i = 0; i < monthlyLeader.length; i++) {
    const leader = monthlyLeader[i];
    if (leader === "tie") continue;
    const remaining = monthlyLeader.length - i;
    const window = Math.min(BREAK_EVEN_CONFIRMATION_MONTHS, remaining);
    const holds = monthlyLeader.slice(i, i + window).every((l) => l === leader);
    if (holds) {
      // Only a genuine "break-even" if this leader differs from month 1's
      // leader (i.e. the lead actually changed hands at some point).
      if (i === 0 || monthlyLeader[0] === leader) continue;
      breakEvenMonth = i + 1;
      break;
    }
  }

  const stayPoint = annualSeries.find((point) => point.year === scenario.holdingPeriodYears);
  const finalRentNet = stayPoint?.rentNet ?? 0;
  const finalBuyNet = stayPoint?.buyNet ?? 0;
  const winner = leaderAt(finalRentNet, finalBuyNet);
  const finalSellingCosts = propertyValue * scenario.sellingCostRate;
  const cashRecoveredAtSale = propertyValue - finalSellingCosts - loanBalance;

  return {
    methodologyVersion: RENT_VS_BUY_METHODOLOGY_VERSION,
    holdingPeriodYears: scenario.holdingPeriodYears,
    firstMonthRentCost,
    firstMonthBuyCost,
    rentNetPosition: finalRentNet,
    buyNetPosition: finalBuyNet,
    winner,
    advantageAmount: Math.abs(finalBuyNet - finalRentNet),
    breakEvenMonth,
    annualSeries,
    mortgagePayoffYear: scenario.loanTermYears,
    estimatedEquityAtStay: Math.max(0, (scenario.propertyPrice * Math.pow(1 + scenario.homeAppreciationAnnual, scenario.holdingPeriodYears)) - (stayPoint?.outstandingMortgageBalance ?? 0)),
    breakdown: {
      rent: {
        rentPaid: cumulativeRentPaid - (scenario.depositRefundable ? 0 : depositAmount) - scenario.renterMovingCosts,
        renterInsurance: cumulativeRenterInsurance,
        movingCosts: scenario.renterMovingCosts,
        depositTreatment: scenario.depositRefundable ? 0 : -depositAmount,
        investmentContributions: cumulativeInvestmentContributions,
        investmentGrowth: investmentAccount - cumulativeInvestmentContributions,
        finalInvestmentAccount: investmentAccount,
        netPosition: finalRentNet,
      },
      buy: {
        downPayment: downPaymentAmount,
        purchaseClosingCosts: closingCosts,
        mortgagePrincipal: cumulativeMortgagePrincipal,
        mortgageInterest: cumulativeMortgageInterest,
        propertyTax: cumulativePropertyTax,
        insurance: cumulativeHomeInsurance,
        maintenance: cumulativeMaintenance,
        hoaFees: cumulativeHOA,
        sellingCosts: finalSellingCosts,
        homeValueAtExit: propertyValue,
        cashRecoveredAtSale,
        netPosition: finalBuyNet,
      },
    },
  };
}

export const RENT_VS_BUY_DEFAULTS: RentBuyScenario = {
  currency: "EUR",
  locationText: "Tirana, Albania",
  holdingPeriodYears: 10,
  rentMonthly: 650,
  rentGrowthAnnual: 0.03,
  renterInsuranceMonthly: 8,
  securityDepositMonths: 1,
  depositRefundable: true,
  renterMovingCosts: 400,
  propertyPrice: 180000,
  downPaymentPercent: 0.2,
  mortgageRateAnnual: 0.055,
  loanTermYears: 25,
  homeAppreciationAnnual: 0.03,
  propertyTaxRateAnnual: 0.005,
  homeInsuranceMonthly: 25,
  maintenanceRateAnnual: 0.01,
  hoaMonthly: 20,
  purchaseClosingCostRate: 0.03,
  sellingCostRate: 0.06,
  investmentReturnAnnual: 0.05,
  investmentFeeDragAnnual: 0.005,
};
