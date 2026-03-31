import { redirect } from '@sveltejs/kit'
import { env } from '$env/dynamic/private'

export const actions = {
  connectGsc: async ({ request }) => {
    const data = await request.formData()
    const token = data.get('token') as string
    const apiBase = env.API_URL?.replace(/\/$/, '') ?? 'http://localhost:3001'
    throw redirect(302, `${apiBase}/api/oauth/gsc?token=${encodeURIComponent(token)}`)
  },
}
