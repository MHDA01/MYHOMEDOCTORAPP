

import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

admin.initializeApp();
const db = admin.firestore();

/**
 * Scheduled function that runs every minute to check for due alarms.
 */
export const checkAlarms = functions
  .region("us-central1")
  .pubsub.schedule("every 1 minutes")
  .onRun(async (context) => {
    console.log("This function runs every minute.");
    // Placeholder for future alarm checking logic
    return null;
  });
