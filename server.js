const express = require("express");
const stripe = require("stripe")(
  "pk_test_51O7pVKCgDCFruCkHDPiH5tBcLpE1PiALeibKIri3yulV92xtAzFG9xcklxVCmzqsWr6peuTWBmjU7W7ibYTTjbG500gTak1UwI",
);
const admin = require("firebase-admin");
const cors = require("cors");

const app = express();
app.use(express.json());
app.use(cors({ origin: true }));

// Initialize Firebase Admin SDK
admin.initializeApp({
  credential: admin.credential.cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
  }),
  databaseURL: process.env.FIREBASE_DATABASE_URL,
});

const db = admin.firestore();

// Create a new checkout session
app.post("/create-checkout-session", async (req, res) => {
  const { priceId, userId } = req.body;

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      payment_method_types: ["card"],
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${process.env.FRONTEND_URL}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.FRONTEND_URL}/canceled`,
      client_reference_id: userId,
    });

    res.json({ sessionId: session.id });
  } catch (error) {
    console.error("Error creating checkout session:", error);
    res.status(500).json({ error: error.message });
  }
});

// Webhook to handle successful payments
app.post(
  "/webhook",
  express.raw({ type: "application/json" }),
  async (request, response) => {
    const sig = request.headers["stripe-signature"];

    let event;

    try {
      event = stripe.webhooks.constructEvent(
        request.body,
        sig,
        process.env.STRIPE_WEBHOOK_SECRET,
      );
    } catch (err) {
      return response.status(400).send(`Webhook Error: ${err.message}`);
    }

    if (event.type === "checkout.session.completed") {
      const session = event.data.object;

      try {
        // Update user's subscription in Firestore
        await db.collection("users").doc(session.client_reference_id).update({
          subscriptionId: session.subscription,
          plan: session.metadata.plan, // Assume you've added plan info to session metadata
          credits: session.metadata.credits, // Assume you've added credits info to session metadata
        });
      } catch (error) {
        console.error("Error updating user subscription:", error);
      }
    }

    response.json({ received: true });
  },
);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
