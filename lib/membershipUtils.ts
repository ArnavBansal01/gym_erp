export interface MembershipPlan {
  id: string;
  name: string;
  tier: string;
  price: number;
  durationMonths: number;
  description: string;
  features: string[];
}

export const GYM_PLANS: MembershipPlan[] = [
  {
    id: 'monthly-standard',
    name: 'Monthly Standard',
    tier: 'Standard',
    price: 2500,
    durationMonths: 1,
    description: 'Full access to weight room, cardio section, and locker rooms.',
    features: ['General Gym Access', 'Cardio & Strength Zones', 'Locker Room & Shower Access'],
  },
  {
    id: 'quarterly-pro',
    name: 'Quarterly Pro',
    tier: 'Pro',
    price: 6500,
    durationMonths: 3,
    description: 'Full gym access plus 1-on-1 personal trainer guidance and diet plan.',
    features: ['All Standard Features', 'Assigned Dedicated Trainer', 'Bi-weekly Body Composition Check', 'Custom Diet Plan'],
  },
  {
    id: 'annual-vip',
    name: 'Annual VIP Pass',
    tier: 'VIP',
    price: 18000,
    durationMonths: 12,
    description: 'Unlimited access, priority trainer coaching, steam bath, and guest passes.',
    features: ['All Pro Features', 'Unlimited Guest Passes (2/mo)', 'Steam & Sauna Access', 'Priority Peak-Hour Booking'],
  },
];

export function computeMembership(rawPlan: any, createdAt: any) {
  const now = new Date();
  let startDate = new Date();

  if (rawPlan?.startDate) {
    startDate = new Date(rawPlan.startDate);
  } else if (createdAt?.toDate) {
    startDate = createdAt.toDate();
  }

  let endDate: Date;
  if (rawPlan?.endDate) {
    endDate = new Date(rawPlan.endDate);
  } else {
    const days = rawPlan?.daysLeft !== undefined ? Number(rawPlan.daysLeft) : 30;
    endDate = new Date(startDate.getTime() + days * 24 * 60 * 60 * 1000);
  }

  const diffMs = endDate.getTime() - now.getTime();
  const daysRemaining = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));

  let status: 'ACTIVE' | 'EXPIRING_SOON' | 'EXPIRED' = 'ACTIVE';
  if (daysRemaining <= 0) {
    status = 'EXPIRED';
  } else if (daysRemaining <= 7) {
    status = 'EXPIRING_SOON';
  }

  return {
    status,
    daysRemaining,
    planName: rawPlan?.name || 'Standard Monthly Access',
    tier: rawPlan?.tier || 'Standard',
    price: rawPlan?.price || '2500',
    startDate,
    endDate,
    startDateFormatted: startDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }),
    endDateFormatted: endDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }),
    isExpired: daysRemaining <= 0,
  };
}
