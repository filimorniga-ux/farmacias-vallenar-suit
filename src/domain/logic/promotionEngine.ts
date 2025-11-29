import { CartItem, Customer, Promotion } from '../types';

export interface DiscountResult {
    originalPrice: number;
    finalPrice: number;
    discountAmount: number;
    promotionApplied?: Promotion;
}

export interface CartWithDiscounts {
    items: (CartItem & { discount?: DiscountResult })[];
    totalDiscount: number;
    finalTotal: number;
}

export const applyPromotions = (
    cart: CartItem[],
    customer: Customer | null,
    activePromotions: Promotion[]
): CartWithDiscounts => {
    const today = new Date();
    const currentDay = today.getDay(); // 0-6
    const now = today.getTime();

    let totalDiscount = 0;

    const itemsWithDiscounts = cart.map(item => {
        let bestDiscount: DiscountResult | null = null;

        // Filter applicable promotions
        const applicablePromotions = activePromotions.filter(promo => {
            if (!promo.isActive) return false;
            if (now < promo.startDate || now > promo.endDate) return false;
            if (promo.days_of_week && !promo.days_of_week.includes(currentDay)) return false;

            // Category check (assuming item has category or we map it)
            // For now, we'll skip category check as CartItem doesn't have it explicitly populated always, 
            // but in a real app we would check item.category === promo.target_category

            // Customer Tag Check
            if (promo.required_customer_tag) {
                if (!customer) return false;
                // Assuming customer.health_tags includes the required tag
                // Or we map specific tags. For simplicity, let's match string inclusion
                if (!customer.health_tags.includes(promo.required_customer_tag as any)) return false;
            }

            return true;
        });

        // Apply logic based on type
        for (const promo of applicablePromotions) {
            let discountAmount = 0;

            if (promo.type === 'PERCENTAGE' && promo.value) {
                discountAmount = item.price * (promo.value / 100);
            } else if (promo.type === 'FIXED_AMOUNT' && promo.value) {
                discountAmount = promo.value;
            }
            // BOGO and BUNDLE would require looking at the whole cart, simplified here for item-level

            if (discountAmount > 0) {
                // Ensure we don't discount more than price
                discountAmount = Math.min(discountAmount, item.price);

                // Pick the best discount
                if (!bestDiscount || discountAmount > bestDiscount.discountAmount) {
                    bestDiscount = {
                        originalPrice: item.price,
                        finalPrice: item.price - discountAmount,
                        discountAmount: discountAmount,
                        promotionApplied: promo
                    };
                }
            }
        }

        if (bestDiscount) {
            totalDiscount += bestDiscount.discountAmount * item.quantity;
            return { ...item, discount: bestDiscount };
        }

        return item;
    });

    const finalTotal = itemsWithDiscounts.reduce((sum, item) => {
        const hasDiscount = 'discount' in item;
        const price = hasDiscount ? (item as any).discount.finalPrice : item.price;
        return sum + (price * item.quantity);
    }, 0);

    return {
        items: itemsWithDiscounts,
        totalDiscount,
        finalTotal
    };
};
