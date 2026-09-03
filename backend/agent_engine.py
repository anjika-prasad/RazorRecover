"""
RazorRecover AI Agent Engine
Provides explainable AI diagnosis, natural language decision justifications,
and personalized multi-channel customer outreach copy (SMS/WhatsApp).
"""

class AIRecoveryAgent:
    @staticmethod
    def diagnose_failure(payment, probability, attributions):
        reason = payment.failure_reason.lower()
        if "network" in reason or "timeout" in reason or "bank" in reason:
            diag = f"Temporary gateway/bank network timeout detected for {payment.customer}. Customer has a high past authorization rate of {int(payment.customer_success_rate*100)}%."
        elif "abandoned" in reason:
            diag = f"Customer dropped off during checkout without entering credentials. Payment link via SMS/WhatsApp recommended."
        elif "decline" in reason or "insufficient" in reason:
            diag = f"Issuer declined transaction authorization for ₹{payment.amount / 100:,.0f}. Automated retries restricted to avoid repeat issuer blocks."
        else:
            diag = f"Payment failure due to {payment.failure_reason}. Model scored recovery likelihood at {int(probability*100)}%."
        return diag

    @staticmethod
    def generate_outreach_copy(payment, recovery_url=None):
        amt_str = f"₹{payment.amount / 100:,.0f}"
        url = recovery_url or f"https://rzp.io/i/rec_{payment.id.lower()}"
        
        sms = f"Hi {payment.customer}, your payment of {amt_str} didn't complete due to a bank connection issue. Tap here to complete securely: {url}"
        
        whatsapp = (
            f"⚡ *Razorpay Payment Alert*\n\n"
            f"Hello {payment.customer},\n"
            f"We noticed your payment of *{amt_str}* for your recent order wasn't completed.\n\n"
            f"Click the safe Razorpay link below to complete your payment with 1-click:\n"
            f"🔗 {url}\n\n"
            f"_Need help? Reply to this message to connect with customer support._"
        )
        
        return {
            "sms_copy": sms,
            "whatsapp_copy": whatsapp,
            "payment_url": url
        }

agent_engine = AIRecoveryAgent()
