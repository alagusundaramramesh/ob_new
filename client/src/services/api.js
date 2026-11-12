import { toast } from "react-toastify";

// Empty value = same server as the page (when the server serves client/build)
const HOSTNAME = process.env.REACT_APP_API_URL || "";

/* Every endpoint is a POST with a JSON body (same as cges.club).
   Pre-login endpoints send the x-api-key header, the others send the JWT. */
export async function callApi(endpoint, data = {}) {
  const headers = {
    "Content-Type": "application/json",
    "x-api-key": process.env.REACT_APP_X_API_KEY,
  };
  const token = localStorage.getItem("token");
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  try {
    const response = await fetch(`${HOSTNAME}/api/${endpoint}`, {
      method: "POST",
      headers,
      body: JSON.stringify(data),
    });
    const result = await response.json();

    // The token is not valid any more: log out
    if (result.status === "UA") {
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      if (window.location.pathname !== "/login") {
        window.location.replace("/login");
      }
    }
    return result;
  } catch (error) {
    console.error(`${endpoint} failed`, error);
    toast.error("Unable to reach the server");
    return { status: "E", message: "Unable to reach the server" };
  }
}

/* AUTH */
export const emailLogin = (email, password) => callApi("login", { email, password });
export const signUp = (formData) => callApi("signup", formData);
export const forgotPassword = (email) => callApi("forgot_password", { email, client_url: window.location.origin });
export const resetPassword = (token, password) => callApi("reset_password", { token, password });
export const changePassword = (old_password, new_password) => callApi("change_password", { old_password, new_password });
export const fetchUserData = () => callApi("get_user_data");
export const switchCompany = (target_c_id) => callApi("switch_company", { target_c_id });
export const createCompany = (formData) => callApi("company_create", formData);
export const updateCompany = (formData) => callApi("company_update", formData);

/* USERS AND ROLES */
export const getUsers = () => callApi("user_list");
export const saveUser = (formData) => callApi("user_save", formData);
export const deleteUser = (delete_user_id) => callApi("user_delete", { delete_user_id });
export const getRoles = () => callApi("role_list");
export const saveRole = (formData) => callApi("role_save", formData);

/* DASHBOARD */
export const getDashboard = () => callApi("dashboard");

/* ACCOUNTS */
export const getAccountGroups = () => callApi("account_group_list");
export const getAccounts = (filters) => callApi("account_list", filters);
export const getOpeningBalances = () => callApi("opening_balance_list");
export const saveOpeningBalances = (formData) => callApi("opening_balance_save", formData);
export const saveAccount = (formData) => callApi("account_save", formData);
export const deleteAccount = (acc_id) => callApi("account_delete", { acc_id });

/* CONTACTS */
export const getContacts = (filters) => callApi("contact_list", filters);
export const getContactDetails = (con_id) => callApi("contact_details", { con_id });
export const saveContact = (formData) => callApi("contact_save", formData);
export const deleteContact = (con_id) => callApi("contact_delete", { con_id });

/* ITEMS AND STOCK */
export const getItems = (filters) => callApi("item_list", filters);
export const getItemDetails = (item_id) => callApi("item_details", { item_id });
export const saveItem = (formData) => callApi("item_save", formData);
export const deleteItem = (item_id) => callApi("item_delete", { item_id });
export const adjustStock = (formData) => callApi("stock_adjust", formData);
export const getCategories = () => callApi("category_list");
export const saveCategory = (formData) => callApi("category_save", formData);
export const deleteCategory = (category_id) => callApi("category_delete", { category_id });

/* OFFICE INVENTORY */
export const getOfficeAssets = (filters) => callApi("office_asset_list", filters);
export const getOfficeAssetDetails = (asset_id) => callApi("office_asset_details", { asset_id });
export const saveOfficeAsset = (formData) => callApi("office_asset_save", formData);
export const deleteOfficeAsset = (asset_id) => callApi("office_asset_delete", { asset_id });
export const setOfficeAssetStatus = (asset_id, status) => callApi("office_asset_status", { asset_id, status });
export const assignOfficeAsset = (formData) => callApi("office_asset_assign", formData);
export const returnOfficeAsset = (formData) => callApi("office_asset_return", formData);
export const getOfficeAssignments = (filters) => callApi("office_assignment_list", filters);

/* SETTINGS */
export const getTaxes = () => callApi("tax_list");
export const saveTax = (formData) => callApi("tax_save", formData);
export const deleteTax = (tax_id) => callApi("tax_delete", { tax_id });
export const getSeries = () => callApi("series_list");
export const saveSeries = (formData) => callApi("series_save", formData);
export const getPaymentModes = () => callApi("payment_mode_list");
export const savePaymentMode = (formData) => callApi("payment_mode_save", formData);

/* BANKING */
export const getBanks = () => callApi("bank_list");
export const saveBank = (formData) => callApi("bank_save", formData);
export const getBankTransactions = (filters) => callApi("bank_transaction_list", filters);
export const saveBankTransaction = (formData) => callApi("bank_transaction_save", formData);

/* TRANSACTIONS */
export const getTransactions = (filters) => callApi("transaction_list", filters);
export const getTransactionDetails = (trans_id) => callApi("transaction_details", { trans_id });
export const saveTransaction = (formData) => callApi("transaction_save", formData);
export const deleteTransaction = (trans_id) => callApi("transaction_delete", { trans_id });
export const convertTransaction = (trans_id, target_trans_type) => callApi("transaction_convert", { trans_id, target_trans_type });

/* REPORTS: endpoint is report_<name> */
export const getReport = (report_name, filters) => callApi(`report_${report_name}`, filters);

/* PDF of a document. The server answers application/pdf, or JSON { status: "E" } when something is wrong.
   Returns { status: "S", blob } or the error object. */
export async function getTransactionPdf(trans_id) {
  try {
    const response = await fetch(`${HOSTNAME}/api/transaction_pdf`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.REACT_APP_X_API_KEY,
        Authorization: `Bearer ${localStorage.getItem("token")}`,
      },
      body: JSON.stringify({ trans_id }),
    });
    if ((response.headers.get("Content-Type") || "").includes("application/pdf")) {
      return { status: "S", blob: await response.blob() };
    }
    return await response.json();
  } catch (error) {
    console.error("transaction_pdf failed", error);
    return { status: "E", message: "Unable to reach the server" };
  }
}

export const emailTransaction = (trans_id, to, message) => callApi("transaction_email", { trans_id, to, message });

/* PRICE LISTS */
export const getPriceLists = (list_type) => callApi("price_list_list", { list_type });
export const savePriceList = (formData) => callApi("price_list_save", formData);
export const deletePriceList = (price_list_id) => callApi("price_list_delete", { price_list_id });

/* RECURRING INVOICES */
export const getRecurring = () => callApi("recurring_list");
export const saveRecurring = (formData) => callApi("recurring_save", formData);
export const deleteRecurring = (recurring_id) => callApi("recurring_delete", { recurring_id });

/* PRINT SETTINGS AND LOGO */
export const savePrintSettings = (formData) => callApi("print_settings_save", formData);
export const saveCompanyLogo = (logo_data) => callApi("company_logo_save", { logo_data });
export const deleteCompanyLogo = () => callApi("company_logo_delete");
export const getFileUrl = (path) => `${HOSTNAME}${path}`;

/* PAYMENT REMINDERS */
export const saveReminderSettings = (formData) => callApi("reminder_settings_save", formData);
export const sendReminder = (trans_id, message) => callApi("reminder_send", { trans_id, message });
export const getReminderLog = (trans_id) => callApi("reminder_log", { trans_id });

/* E-INVOICE AND E-WAY BILL */
export const getEinvoiceSettings = () => callApi("einvoice_settings_get");
export const saveEinvoiceSettings = (formData) => callApi("einvoice_settings_save", formData);
export const checkEinvoice = (trans_id) => callApi("einvoice_check", { trans_id });
export const generateEinvoice = (trans_id) => callApi("einvoice_generate", { trans_id });
export const cancelEinvoice = (formData) => callApi("einvoice_cancel", formData);
export const getEinvoiceWorklist = (kind, page, limit) => callApi("einvoice_worklist", { kind, page, limit });
export const checkEwb = (formData) => callApi("ewb_check", formData);
export const generateEwb = (formData) => callApi("ewb_generate", formData);
export const cancelEwb = (formData) => callApi("ewb_cancel", formData);
export const updateEwbVehicle = (formData) => callApi("ewb_update_vehicle", formData);
export const extendEwb = (formData) => callApi("ewb_extend", formData);
export const updateEwbTransporter = (formData) => callApi("ewb_update_transporter", formData);
export const getTransporters = () => callApi("transporter_list");
export const saveTransporter = (formData) => callApi("transporter_save", formData);
export const deleteTransporter = (tp_id) => callApi("transporter_delete", { tp_id });
