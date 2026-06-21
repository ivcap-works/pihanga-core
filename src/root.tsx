import React from "react";
import {Provider} from "react-redux";

import {Card} from "./card";
import {Store} from "@reduxjs/toolkit";

export function RootComponent(store: Store) {
  return (
    <React.StrictMode>
      <Provider store={store}>
        <Card cardName="_window" parentCard="" />
      </Provider>
    </React.StrictMode>
  );
}
