const Razorpay = require("razorpay");
const crypto = require("crypto");
const fetch = require("node-fetch"); // Required for Vercel environment

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

  // 1. Verify the payment signature
  const body = razorpay_order_id + "|" + razorpay_payment_id;
  const expectedSignature = crypto
    .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
    .update(body.toString())
    .digest("hex");

  if (expectedSignature !== razorpay_signature) {
    return res.status(400).json({ error: "Invalid signature" });
  }

  // 2. If signature is valid, send data to your Google Sheet
  if (process.env.WEBHOOK_URL) {
    try {
      const payload = {
        name: studentData.name,
        email: studentData.email,
        phone: studentData.phone,
        course: studentData.course_name,
        courseType: studentData.course_type,
        collegeName: studentData.college_name || '',
        branch: studentData.branch || '',
        batch: studentData.course_month,
        state: studentData.state,
        city: studentData.city,
        counsellorId: studentData.counselor_id || '',
        paymentOption: studentData.payment_type,
        discountCoupon: studentData.coupon || '',
        finalAmount: totalAmount,
        timestamp: new Date().getTime(),
        paymentDate: new Date().toISOString(),
        orderId: razorpay_order_id,
        paymentId: razorpay_payment_id,
        experience: studentData.experience || '',
        college_email: studentData.college_email || ''
      };

      fetch(process.env.WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }).catch(err => console.error("Webhook to Google Script failed:", err));

    } catch (error) {
      console.error("Error sending data to Google Script:", error);
    }
  }

  // 3. If user chose installments, create the auto-pay subscription
  if (studentData.payment_type === 'installment') {
    try {
      const customer = await razorpay.customers.create({ name: studentData.name, email: studentData.email, contact: studentData.phone });
      
      // Use the pre-existing plan_id from your environment variables
      await razorpay.subscriptions.create({
        plan_id: process.env.RAZORPAY_PLAN_ID,
        customer_id: customer.id,
        total_count: 2, // Two weekly installments
      });

    } catch (error) {
      console.error("Error creating subscription:", error);
    }
  }

  // 4. Send a success response back to the frontend
  res.status(200).json({ status: "success", orderId: razorpay_order_id });
};
