import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://mdzfsfeagqtlimgenzso.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1kemZzZmVhZ3F0bGltZ2VuenNvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA0NjI5NjIsImV4cCI6MjA4NjAzODk2Mn0.2NlCcuLl9dGBfnfLt3D8A6rZyuCfOCMWYHWskOyyse0';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
