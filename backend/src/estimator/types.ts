import { ActionType } from "../config/modelingConfig";
import { CaseContext } from "../context/contextBuilder";

export interface EstimatorInput {
  context: CaseContext;
  action: ActionType;
}

export interface Prediction {
  action: ActionType;
  probability: number;
  confidence: number;
}

export interface FrozenModel {
  version: string;
  trainedAt: string;
  featureNames: string[];
  weights: number[];
  intercept: number;
  validation: {
    brierScore: number;
    sampleCount: number;
  };
}