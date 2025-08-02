const Razorpay = require("razorpay");
const crypto = require("crypto");

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).send({ message: 'Only POST requests allowed' });
  }

  const {
    razorpay_order_id,
    razorpay_payment_id,
    razorpay_signature,
    studentData,
    totalAmount,
  } = req.body;

  const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
  });

  const body = razorpay_order_id + "|" + razorpay_payment_id;
  const expectedSignature = crypto
    .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
    .update(body.toString())
    .digest("hex");

  if (expectedSignature !== razorpay_signature) {
    return res.status(400).json({ error: "Invalid signature" });
  }

  if (process.env.WEBHOOK_URL) {
    // Fire-and-forget webhook call
    fetch(process.env.WEBHOOK_URL, {
        method: 'POST',
        headers: { 
            'Content-Type': 'application/json',
            'x-make-apikey': process.env.MAKE_API_KEY 
        },
        body: JSON.stringify({ ...studentData, paymentId: razorpay_payment_id, orderId: razorpay_order_id, totalAmountPaid: totalAmount, paymentDate: new Date().toISOString() }),
    }).catch(err => console.error("Webhook failed:", err));
  }

  if (studentData.payment_type === 'installment') {
    try {
      const customer = await razorpay.customers.create({ name: studentData.name, email: studentData.email, contact: studentData.phone });
      const remainingAmount = totalAmount - 1025;
      const installmentAmount = Math.round(remainingAmount / 2);
      const plan = await razorpay.plans.create({
        period: "monthly",
        interval: 1,
        item: { name: `Installment Plan for ${studentData.course_name}`, amount: installmentAmount * 100, currency: "INR", description: "2-month installment plan" },
      });
      await razorpay.subscriptions.create({
        plan_id: plan.id,
        customer_id: customer.id,
        total_count: 2,
        start_at: Math.floor(new Date(new Date().setMonth(new Date().getMonth() + 1)).getTime() / 1000),
      });
    } catch (error) {
      console.error("Error creating subscription:", error);
    }
  }

  res.status(200).json({ status: "success", orderId: razorpay_order_id });
};