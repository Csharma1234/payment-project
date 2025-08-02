// /api/verify-payment.js
const Razorpay = require("razorpay");
const crypto = require("crypto");

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).send({ message: 'Only POST requests allowed' });
  }

  const {
    razorpay_order_id,
    razorpay_payment_id,
    razorpay_signature,
    studentData,
    totalAmount, // This will be 4 (1 for reg + 3 for installments)
  } = req.body;

  const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
  });

  // 1. VERIFY THE SIGNATURE
  const body = razorpay_order_id + "|" + razorpay_payment_id;
  const expectedSignature = crypto
    .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
    .update(body.toString())
    .digest("hex");

  if (expectedSignature !== razorpay_signature) {
    return res.status(400).json({ error: "Invalid signature" });
  }

  // 2. PAYMENT IS VERIFIED - SEND DATA TO SPREADSHEET
  if (process.env.WEBHOOK_URL) {
    try {
      const payload = {
        ...studentData,
        paymentId: razorpay_payment_id,
        orderId: razorpay_order_id,
        totalCourseAmount: totalAmount,
        paymentDate: new Date().toISOString(),
      };
      const headers = { 'Content-Type': 'application/json' };
      if (process.env.MAKE_API_KEY) {
        headers['x-make-apikey'] = process.env.MAKE_API_KEY;
      }
      fetch(process.env.WEBHOOK_URL, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(payload),
      });
      console.log("Successfully sent data to webhook.");
    } catch (error) {
      console.error("Error sending data to webhook:", error);
    }
  }

  // 3. IF INSTALLMENT, CREATE A SUBSCRIPTION FOR AUTO-PAY (TESTING LOGIC)
  if (studentData.payment_type === 'installment') {
    try {
      const customer = await razorpay.customers.create({
        name: studentData.name,
        email: studentData.email,
        contact: studentData.phone,
      });

      // Total auto-debit is 3, so each of the 2 installments is 1.5 Rupees (150 paise)
      const installmentAmount = 150; 

      const plan = await razorpay.plans.create({
        period: "weekly", // Set period to weekly
        interval: 2,       // Set interval to 2 for "every two weeks"
        item: {
          name: `TEST Installment Plan for ${studentData.course_name}`,
          amount: installmentAmount, // in paise
          currency: "INR",
          description: "2-week installment test plan",
        },
      });

      const subscription = await razorpay.subscriptions.create({
        plan_id: plan.id,
        customer_id: customer.id,
        total_count: 2, // The subscription will run for 2 installments
        start_at: Math.floor(new Date(new Date().setDate(new Date().getDate() + 14)).getTime() / 1000), // Starts in 14 days
      });
      
      console.log("TEST Subscription created:", subscription.id);
    } catch (error) {
      console.error("Error creating TEST subscription:", error);
    }
  }

  res.status(200).json({ status: "success", orderId: razorpay_order_id });
}
