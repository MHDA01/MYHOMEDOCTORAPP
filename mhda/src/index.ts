
import {initializeApp} from "firebase-admin/app";
import {setGlobalOptions} from "firebase-functions";

initializeApp();

setGlobalOptions({maxInstances: 10});

export * from "./document-processor";
