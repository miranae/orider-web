import { createContext, useContext } from "react";

export const RetainedPageContext = createContext(true);
export const useRetainedPageVisible = () => useContext(RetainedPageContext);
