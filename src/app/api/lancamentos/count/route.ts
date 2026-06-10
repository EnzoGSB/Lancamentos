import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

export async function GET() {
  const { count, error } = await supabaseAdmin
    .from('lancamentos')
    .select('*', { count: 'exact', head: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ count: count ?? 0 })
}
