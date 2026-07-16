// src/app.root.tsx — Redux Provider + Toaster wrapper
// Passed as `rootComponent` to start() in main.ts.
import React from "react";
import {Provider} from "react-redux";
import type {Store} from "@reduxjs/toolkit";
import {Card} from "@pihanga2/core";
import {Toaster} from "sonner";

export function RootComponent(store: Store) {
  return (
    <React.StrictMode>
      <Provider store={store}>
        <Card cardName="_window" parentCard="" />
        <Toaster />
      </Provider>
    </React.StrictMode>
  );
}
