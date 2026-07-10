import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://mfgguyfubnmjhtqnbsjt.supabase.co";
const SUPABASE_KEY = "sb_publishable_I3GcHbLfAHjMEuwrjaEABQ_Wl43XwCr";

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);