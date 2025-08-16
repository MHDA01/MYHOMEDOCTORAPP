
import {initializeApp} from "firebase-admin/app";
import {setGlobalOptions} from "firebase-functions/v2";

initializeApp();

setGlobalOptions({
  maxInstances: 10,
  region: "us-central1"
});

export * from "./document-processor";
