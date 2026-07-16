// src/main.ts
import "./index.css";
import {DEFAULT_REDUX_STATE, start} from "@pihanga2/core";

import type {AppState} from "./app.state";
import {appPiInit} from "./app.pihanga";
import "./app.reducer"; // registers the external onButtonClicked handler
import {RootComponent} from "./app.root";

const initState: AppState = {
  ...DEFAULT_REDUX_STATE,
  count: 0,
};

start(initState, [appPiInit], {
  rootComponent: RootComponent,
});
