import { createContext, useContext } from 'react';
export const FeatureActivity = createContext(true);
export const useFeatureActive = () => useContext(FeatureActivity);
