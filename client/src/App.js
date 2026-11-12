import React from 'react';
import { Route, createBrowserRouter, createRoutesFromElements, RouterProvider, Navigate } from 'react-router-dom';
import { Bounce, ToastContainer } from "react-toastify";

import Mainlayout from './layouts/mainlayout';
import AuthLayout from './layouts/auth_layout';
import { GlobalStateProvider } from "./contexts/user";

import Login from './pages/login';
import Signup from './pages/signup';
import ForgotPassword from './pages/forgot_password';
import ResetPassword from './pages/reset_password';
import Dashboard from './pages/dashboard';
import Customers from './pages/customers';
import Suppliers from './pages/suppliers';
import Items from './pages/items';
import Categories from './pages/categories';
import Accounts from './pages/accounts';
import OpeningBalances from './pages/opening_balances';
import Banks from './pages/banks';
import Transactions from './pages/transactions';
import TransactionForm from './pages/transaction_form';
import TransactionView from './pages/transaction_view';
import Reports from './pages/reports';
import ReportView from './pages/report_view';
import Settings from './pages/settings';
import MyAccount from './pages/my_account';
import Recurring from './pages/recurring';
import Einvoice from './pages/einvoice';
import OfficeAssets from './pages/office_assets';
import OfficeAssignments from './pages/office_assignments';
import { useGlobalState } from "./contexts/user";

/* Office Inventory users do not have the Dashboard module, so they start on the asset list */
const Home = () => {
  const { user } = useGlobalState();
  const permissions = user.permissions || [];
  if (!permissions.includes("DAS") && permissions.includes("OIAST")) {
    return <Navigate to="/office-assets" replace />;
  }
  return <Dashboard />;
};

const router = createBrowserRouter(
  createRoutesFromElements(
    <>
      {/* Pages before login */}
      <Route element={<AuthLayout />}>
        <Route path='/login' element={<Login />} />
        <Route path='/signup' element={<Signup />} />
        <Route path='/forgot-password' element={<ForgotPassword />} />
        <Route path='/reset-password' element={<ResetPassword />} />
      </Route>

      {/* Pages after login */}
      <Route path='/' element={<Mainlayout />}>
        <Route index element={<Home />} />
        <Route path='/customers' element={<Customers />} />
        <Route path='/suppliers' element={<Suppliers />} />
        <Route path='/items' element={<Items />} />
        <Route path='/categories' element={<Categories />} />
        <Route path='/accounts' element={<Accounts />} />
        <Route path='/opening-balances' element={<OpeningBalances />} />
        <Route path='/banks' element={<Banks />} />
        <Route path='/office-assets' element={<OfficeAssets />} />
        <Route path='/office-assignments' element={<OfficeAssignments />} />

        {/* Documents: /t/sales-invoice, /t/sales-invoice/new, /t/sales-invoice/12, /t/sales-invoice/12/view */}
        <Route path='/t/:type_key' element={<Transactions />} />
        <Route path='/t/:type_key/new' element={<TransactionForm />} />
        <Route path='/t/:type_key/:trans_id' element={<TransactionForm />} />
        <Route path='/t/:type_key/:trans_id/view' element={<TransactionView />} />

        <Route path='/reports' element={<Reports />} />
        <Route path='/reports/:report_name' element={<ReportView />} />
        <Route path='/recurring' element={<Recurring />} />
        <Route path='/einvoice' element={<Einvoice />} />
        <Route path='/settings' element={<Settings />} />
        <Route path='/my-account' element={<MyAccount />} />
        <Route path='*' element={<Navigate to="/" replace />} />
      </Route>
    </>
  )
);

const App = () => {
  return (
    <>
      <ToastContainer
        position="top-center"
        autoClose={4000}
        hideProgressBar={false}
        newestOnTop={true}
        closeOnClick={true}
        rtl={false}
        pauseOnFocusLoss
        draggable
        pauseOnHover
        theme="colored"
        transition={Bounce}
      />
      <GlobalStateProvider><RouterProvider router={router} /></GlobalStateProvider>
    </>
  );
}

export default App;
