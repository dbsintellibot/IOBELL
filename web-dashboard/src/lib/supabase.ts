import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://hjlwzkwiweocnfztshmy.supabase.co'
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhqbHd6a3dpd2VvY25menRzaG15Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMzNjEyNDEsImV4cCI6MjA5ODkzNzI0MX0.OUx-ZWTdA-_BCW8sbIMw8E13CONOh5IjcjLko87RRC0'

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
