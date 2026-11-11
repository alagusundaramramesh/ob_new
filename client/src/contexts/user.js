import React, { createContext, useReducer, useContext } from "react";

// Create the initial state
const initialState = {
  user: JSON.parse(localStorage.getItem("user")) || null,
};

/* user = { user, company, role, permissions, companies } (the data of the get_user_data endpoint) */
const reducer = (state, action) => {
  switch (action.type) {
    case "SET_USER":
      localStorage.setItem("user", JSON.stringify(action.payload));
      return { ...state, user: action.payload };
    case "CLEAR_USER":
      localStorage.removeItem("user");
      localStorage.removeItem("token");
      return { ...state, user: null };
    default:
      return state;
  }
};

// Create a context
const GlobalStateContext = createContext();
const GlobalDispatchContext = createContext();

// Create provider
export const GlobalStateProvider = ({ children }) => {
  const [state, dispatch] = useReducer(reducer, initialState);

  return (
    <GlobalStateContext.Provider value={state}>
      <GlobalDispatchContext.Provider value={dispatch}>
        {children}
      </GlobalDispatchContext.Provider>
    </GlobalStateContext.Provider>
  );
};

// Custom hooks to access the state and dispatch
export const useGlobalState = () => useContext(GlobalStateContext);
export const useGlobalDispatch = () => useContext(GlobalDispatchContext);
