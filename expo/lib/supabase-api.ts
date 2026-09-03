import { supabase } from './supabase';
import { sendEmail } from './email';
import { Event, Promoter, EventCategory } from '@/types/event';
import { calculateTicketCommission, roundCurrency } from '@/utils/commission';

function safeJsonParse<T>(val: unknown, fallback: T): T {
  if (val === null || val === undefined) return fallback;
  if (Array.isArray(val)) return val as unknown as T;
  if (typeof val === 'object') {
    if (Array.isArray(fallback) && !Array.isArray(val)) {
      return fallback;
    }
    return val as unknown as T;
  }
  if (typeof val === 'string') {
    try {
      const parsed = JSON.parse(val);
      if (Array.isArray(fallback) && !Array.isArray(parsed)) {
        return fallback;
      }
      return parsed;
    } catch { return fallback; }
  }
  return fallback;
}

function safeArray(val: unknown): any[] {
  if (Array.isArray(val)) return val;
  if (val === null || val === undefined) return [];
  if (typeof val === 'string') {
    try {
      const parsed = JSON.parse(val);
      return Array.isArray(parsed) ? parsed : [];
    } catch { return []; }
  }
  return [];
}

function genId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
}

function mapDbEventToEvent(row: any): Event {
  const p = row.promoters;
  const promoter: Promoter = p ? {
    id: p.id,
    name: p.name,
    image: p.image || '',
    description: p.description || '',
    verified: p.verified || false,
    followersCount: p.followers_count || 0,
  } : {
    id: row.promoter_id || 'unknown',
    name: 'Promotor',
    image: '',
    description: '',
    verified: false,
    followersCount: 0,
  };

  return {
    id: row.id,
    title: row.title,
    status: (row.status || 'pending') as Event['status'],
    artists: safeArray(row.artists),
    venue: {
      id: `venue-${row.id}`,
      name: row.venue_name || '',
      address: row.venue_address || '',
      city: row.venue_city || '',
      capacity: row.venue_capacity || 0,
    },
    date: new Date(row.date),
    endDate: row.end_date ? new Date(row.end_date) : undefined,
    image: row.image || '',
    description: row.description || '',
    category: (row.category || 'other') as EventCategory,
    ticketTypes: safeArray(row.ticket_types).map((t: any, idx: number) => ({
      // Fallback id guarantees each ticket type is unique — without it, types
      // without an id all map to '' and share the same selection/cart key
      id: t.id || t.ticketTypeId || `tt-${row.id}-${idx}`,
      name: t.name || '',
      price: t.price || 0,
      available: t.available ?? 0,
      description: t.description,
      maxPerPerson: t.maxPerPerson || 4,
      active: t.active !== false,
    })),
    isSoldOut: row.is_sold_out || false,
    isFeatured: row.is_featured || false,
    duration: row.duration || undefined,
    promoter,
    tags: safeArray(row.tags),
    socialLinks: (row.instagram_link || row.facebook_link || row.twitter_link || row.website_link) ? {
      instagram: row.instagram_link || undefined,
      facebook: row.facebook_link || undefined,
      twitter: row.twitter_link || undefined,
      website: row.website_link || undefined,
    } : undefined,
    coordinates: (row.latitude != null && row.longitude != null) ? {
      latitude: row.latitude,
      longitude: row.longitude,
    } : undefined,
  };
}

export const eventsApi = {
  list: async (input?: any): Promise<Event[]> => {
    try {
      let query = supabase
        .from('events')
        .select('*, promoters(*)')
        .order('date', { ascending: true });

      if (input?.featured) query = query.eq('is_featured', true);
      if (input?.promoterId) query = query.eq('promoter_id', input.promoterId);
      if (input?.category) query = query.eq('category', input.category);
      if (input?.status) query = query.eq('status', input.status);

      const { data, error } = await query;

      if (error) {
        console.error('[eventsApi.list] Supabase error:', error.message);
        return [];
      }
      return (data || []).map(mapDbEventToEvent);
    } catch (err) {
      console.error('[eventsApi.list] error:', err);
      return [];
    }
  },

  get: async (input: { id: string }): Promise<Event | null> => {
    try {
      const { data, error } = await supabase
        .from('events')
        .select('*, promoters(*)')
        .eq('id', input.id)
        .single();

      if (error || !data) {
        console.error('[eventsApi.get] Supabase error:', error?.message);
        return null;
      }
      return mapDbEventToEvent(data);
    } catch (err) {
      console.error('[eventsApi.get] error:', err);
      return null;
    }
  },

  create: async (input: any): Promise<any> => {
    try {
      const eventId = input.id || genId('event');

      // events.promoter_id tem FK NOT NULL para promoters(id). Resolve um id
      // válido: usa o recebido se existir, caso contrário recorre ao perfil de
      // promotor do utilizador, criando a linha pública em promoters se faltar.
      let resolvedPromoterId = '';
      if (input.promoterId && input.promoterId !== 'unknown') {
        const { data: existingPromoter } = await supabase
          .from('promoters')
          .select('id')
          .eq('id', input.promoterId)
          .maybeSingle();
        if (existingPromoter) {
          resolvedPromoterId = input.promoterId;
        }
      }
      if (!resolvedPromoterId && input.userId) {
        const { data: profile } = await supabase
          .from('promoter_profiles')
          .select('id, company_name')
          .eq('user_id', input.userId)
          .order('is_approved', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (profile) {
          const { data: publicRow } = await supabase
            .from('promoters')
            .select('id')
            .eq('id', profile.id)
            .maybeSingle();
          if (publicRow) {
            resolvedPromoterId = profile.id;
          } else {
            const { data: createdPromoter } = await supabase
              .from('promoters')
              .insert({
                id: profile.id,
                name: profile.company_name || 'Promotor',
                image: '',
                description: '',
                verified: false,
                followers_count: 0,
              })
              .select('id')
              .single();
            if (createdPromoter) {
              resolvedPromoterId = createdPromoter.id;
              console.log('[eventsApi.create] Auto-created missing promoters row for profile:', profile.id);
            }
          }
        }
      }
      if (!resolvedPromoterId) {
        throw new Error('Perfil de promotor não encontrado. Complete o registo como promotor antes de criar eventos.');
      }

      const { data, error } = await supabase.from('events').insert({
        id: eventId,
        title: input.title,
        artists: JSON.stringify(input.artists || []),
        venue_name: input.venueName || input.venue?.name || '',
        venue_address: input.venueAddress || input.venue?.address || '',
        venue_city: input.venueCity || input.venue?.city || '',
        venue_capacity: input.venueCapacity || input.venue?.capacity || 0,
        date: input.date,
        end_date: input.endDate || null,
        image: input.image || '',
        description: input.description || '',
        category: input.category || 'other',
        ticket_types: JSON.stringify((input.ticketTypes || []).map((t: any, i: number) => ({
          ...t,
          id: t.id || `tt-${i + 1}`,
        }))),
        is_sold_out: input.isSoldOut || false,
        is_featured: input.isFeatured || false,
        duration: input.duration || null,
        promoter_id: resolvedPromoterId,
        tags: JSON.stringify(input.tags || []),
        instagram_link: input.instagramLink || null,
        facebook_link: input.facebookLink || null,
        twitter_link: input.twitterLink || null,
        website_link: input.websiteLink || null,
        latitude: input.latitude || null,
        longitude: input.longitude || null,
        status: input.status || 'pending',
      }).select().single();

      if (error) throw error;

      try {
        if (resolvedPromoterId) {
          const { data: promoterProfile } = await supabase
            .from('promoter_profiles')
            .select('user_id, company_name')
            .eq('id', resolvedPromoterId)
            .maybeSingle();

          let promoterEmail = '';
          let promoterName = promoterProfile?.company_name || 'Promotor';

          if (promoterProfile?.user_id) {
            const { data: userData } = await supabase
              .from('users')
              .select('email, name')
              .eq('id', promoterProfile.user_id)
              .single();
            if (userData) {
              promoterEmail = userData.email || '';
              promoterName = userData.name || promoterName;
            }
          }

          if (promoterEmail) {
            console.log('[eventsApi.create] Sending admin notification email for new event...');
            sendEmail({
              type: 'sendNewEventNotification',
              eventTitle: input.title || 'Sem título',
              promoterName,
              promoterEmail,
              eventDate: input.date || '',
              venueName: input.venueName || input.venue?.name || '',
              category: input.category || 'other',
            });
          }
        }
      } catch (emailErr: any) {
        console.warn('[eventsApi.create] Non-critical email error:', emailErr?.message);
      }

      return data || { id: eventId };
    } catch (err: any) {
      console.error('[eventsApi.create] error:', JSON.stringify(err));
      if (err?.code === '42501') {
        throw new Error('Sem permissão para criar eventos. Verifique se a sua conta de promotor está aprovada.');
      }
      throw new Error(err?.message || 'Erro ao criar evento');
    }
  },

  update: async (input: any): Promise<any> => {
    try {
      const { id, ...rest } = input;
      const updates: Record<string, any> = {};
      if (rest.title !== undefined) updates.title = rest.title;
      if (rest.artists !== undefined) updates.artists = typeof rest.artists === 'string' ? rest.artists : JSON.stringify(rest.artists);
      if (rest.venueName !== undefined) updates.venue_name = rest.venueName;
      if (rest.venueAddress !== undefined) updates.venue_address = rest.venueAddress;
      if (rest.venueCity !== undefined) updates.venue_city = rest.venueCity;
      if (rest.venueCapacity !== undefined) updates.venue_capacity = rest.venueCapacity;
      if (rest.date !== undefined) updates.date = rest.date;
      if (rest.endDate !== undefined) updates.end_date = rest.endDate;
      if (rest.image !== undefined) updates.image = rest.image;
      if (rest.description !== undefined) updates.description = rest.description;
      if (rest.category !== undefined) updates.category = rest.category;
      if (rest.ticketTypes !== undefined) updates.ticket_types = typeof rest.ticketTypes === 'string' ? rest.ticketTypes : JSON.stringify(rest.ticketTypes);
      if (rest.isSoldOut !== undefined) updates.is_sold_out = rest.isSoldOut;
      if (rest.isFeatured !== undefined) updates.is_featured = rest.isFeatured;
      if (rest.duration !== undefined) updates.duration = rest.duration;
      if (rest.tags !== undefined) updates.tags = typeof rest.tags === 'string' ? rest.tags : JSON.stringify(rest.tags);
      if (rest.instagramLink !== undefined) updates.instagram_link = rest.instagramLink;
      if (rest.facebookLink !== undefined) updates.facebook_link = rest.facebookLink;
      if (rest.twitterLink !== undefined) updates.twitter_link = rest.twitterLink;
      if (rest.websiteLink !== undefined) updates.website_link = rest.websiteLink;
      if (rest.latitude !== undefined) updates.latitude = rest.latitude;
      if (rest.longitude !== undefined) updates.longitude = rest.longitude;
      if (rest.status !== undefined) updates.status = rest.status;

      if (Object.keys(updates).length === 0) throw new Error('No fields to update');

      const { data, error } = await supabase
        .from('events')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (err) {
      console.error('[eventsApi.update] error:', err);
      throw err;
    }
  },

  delete: async (input: { id: string }): Promise<{ success: boolean }> => {
    try {
      const { error } = await supabase.from('events').delete().eq('id', input.id);
      if (error) throw error;
      return { success: true };
    } catch (err) {
      console.error('[eventsApi.delete] error:', err);
      throw err;
    }
  },

  cancel: async (input: { eventId: string; reason?: string }): Promise<any> => {
    try {
      const { data: event } = await supabase
        .from('events')
        .select('*')
        .eq('id', input.eventId)
        .single();

      if (!event) throw new Error('Evento não encontrado');
      if (event.status === 'cancelled') throw new Error('Evento já está cancelado');

      const { data, error } = await supabase
        .from('events')
        .update({ status: 'cancelled' })
        .eq('id', input.eventId)
        .select()
        .single();

      if (error) throw error;

      if (event.promoter_id) {
        const message = input.reason
          ? `O seu evento "${event.title}" foi cancelado. Motivo: ${input.reason}`
          : `O seu evento "${event.title}" foi cancelado.`;
        await supabase.from('notifications').insert({
          id: genId('notif'),
          user_id: event.promoter_id,
          type: 'system',
          title: 'Evento Cancelado',
          message,
          data: JSON.stringify({ eventId: input.eventId, reason: input.reason }),
          is_read: false,
        });
      }

      return data;
    } catch (err) {
      console.error('[eventsApi.cancel] error:', err);
      throw err;
    }
  },

  approve: async (input: { eventId: string }): Promise<any> => {
    try {
      const { data: event } = await supabase
        .from('events')
        .select('*, promoters(*)')
        .eq('id', input.eventId)
        .single();

      if (!event) throw new Error('Evento não encontrado');

      const { data, error } = await supabase
        .from('events')
        .update({ status: 'published' })
        .eq('id', input.eventId)
        .select()
        .single();

      if (error) throw error;

      if (event.promoter_id) {
        await supabase.from('notifications').insert({
          id: genId('notif'),
          user_id: event.promoter_id,
          type: 'event_approved',
          title: 'Evento Aprovado! 🎉',
          message: `O seu evento "${event.title}" foi aprovado e está agora publicado.`,
          data: JSON.stringify({ eventId: input.eventId, eventTitle: event.title }),
          is_read: false,
        });

        const { data: followers } = await supabase
          .from('following')
          .select('user_id')
          .eq('promoter_id', event.promoter_id);

        if (followers && followers.length > 0) {
          const promoterName = event.promoters?.name || 'Promotor';
          const eventDate = new Date(event.date);
          const formattedDate = eventDate.toLocaleDateString('pt-PT', { day: 'numeric', month: 'long', year: 'numeric' });
          const notifs = followers.map((f: any) => ({
            id: genId('notif'),
            user_id: f.user_id,
            type: 'new_promoter_event',
            title: `${promoterName} tem um novo evento! 🎉`,
            message: `${event.title} - ${formattedDate} em ${event.venue_name}`,
            data: JSON.stringify({ eventId: input.eventId, eventTitle: event.title, promoterId: event.promoter_id }),
            is_read: false,
          }));
          await supabase.from('notifications').insert(notifs);
        }
      }

      return data;
    } catch (err) {
      console.error('[eventsApi.approve] error:', err);
      throw err;
    }
  },

  reject: async (input: { eventId: string; reason?: string }): Promise<any> => {
    try {
      const { data: event } = await supabase
        .from('events')
        .select('*')
        .eq('id', input.eventId)
        .single();

      if (!event) throw new Error('Evento não encontrado');
      if (event.status !== 'pending') throw new Error('Apenas eventos pendentes podem ser rejeitados');

      const { data, error } = await supabase
        .from('events')
        .update({ status: 'cancelled' })
        .eq('id', input.eventId)
        .select()
        .single();

      if (error) throw error;

      if (event.promoter_id) {
        const message = input.reason
          ? `O seu evento "${event.title}" foi rejeitado. Motivo: ${input.reason}`
          : `O seu evento "${event.title}" foi rejeitado.`;
        await supabase.from('notifications').insert({
          id: genId('notif'),
          user_id: event.promoter_id,
          type: 'system',
          title: 'Evento Rejeitado',
          message,
          data: JSON.stringify({ eventId: input.eventId, reason: input.reason }),
          is_read: false,
        });
      }

      return data;
    } catch (err) {
      console.error('[eventsApi.reject] error:', err);
      throw err;
    }
  },

  listPending: async (): Promise<any[]> => {
    try {
      const { data, error } = await supabase
        .from('events')
        .select('*, promoters(*)')
        .eq('status', 'pending')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('[eventsApi.listPending] Supabase error:', error.message);
        return [];
      }
      if (!data) return [];

      return data.map((row: any) => ({
        id: row.id,
        title: row.title,
        artists: safeArray(row.artists),
        venue: { name: row.venue_name, address: row.venue_address, city: row.venue_city, capacity: row.venue_capacity },
        date: row.date,
        endDate: row.end_date,
        image: row.image,
        description: row.description,
        category: row.category,
        ticketTypes: safeArray(row.ticket_types),
        promoter: row.promoters ? {
          id: row.promoters.id,
          name: row.promoters.name,
          image: row.promoters.image,
          description: row.promoters.description,
          verified: row.promoters.verified,
          followersCount: row.promoters.followers_count,
        } : null,
        tags: safeArray(row.tags),
        socialLinks: { instagram: row.instagram_link, facebook: row.facebook_link, twitter: row.twitter_link, website: row.website_link },
        coordinates: (row.latitude && row.longitude) ? { latitude: row.latitude, longitude: row.longitude } : null,
        status: row.status,
        createdAt: row.created_at,
      }));
    } catch {
      return [];
    }
  },

  getPendingDetails: async (input: { eventId: string }): Promise<any> => {
    try {
      const { data, error } = await supabase
        .from('events')
        .select('*, promoters(*)')
        .eq('id', input.eventId)
        .single();

      if (error || !data) return null;
      return mapDbEventToEvent(data);
    } catch {
      return null;
    }
  },

  setFeatured: async (input: { id: string; featured: boolean }): Promise<any> => {
    try {
      const { data, error } = await supabase
        .from('events')
        .update({ is_featured: input.featured })
        .eq('id', input.id)
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (err) {
      console.error('[eventsApi.setFeatured] error:', err);
      throw err;
    }
  },

  search: async (input: any): Promise<Event[]> => {
    try {
      let query = supabase
        .from('events')
        .select('*, promoters(*)')
        .order('date', { ascending: true });

      if (input?.query) {
        query = query.or(`title.ilike.%${input.query}%,description.ilike.%${input.query}%,venue_city.ilike.%${input.query}%`);
      }
      if (input?.category) query = query.eq('category', input.category);
      if (input?.venueCity) query = query.ilike('venue_city', `%${input.venueCity}%`);
      // Public search only shows approved events
      query = query.eq('status', 'published');

      const { data, error } = await query;

      if (error || !data) {
        console.error('[eventsApi.search] Supabase error:', error?.message);
        return [];
      }
      return data.map(mapDbEventToEvent);
    } catch {
      return [];
    }
  },

  searchSuggestions: async (input: { query: string }): Promise<string[]> => {
    try {
      const { data } = await supabase
        .from('events')
        .select('title, venue_city')
        .or(`title.ilike.%${input.query}%,venue_city.ilike.%${input.query}%`)
        .limit(5);

      if (data && data.length > 0) {
        return [...new Set(data.map((d: any) => d.title))];
      }
      return [];
    } catch {
      return [];
    }
  },

  statistics: async (input: { eventId: string }): Promise<any> => {
    try {
      const { data } = await supabase
        .from('event_statistics')
        .select('*')
        .eq('event_id', input.eventId)
        .single();

      if (data) {
        return {
          eventId: data.event_id,
          totalTicketsSold: data.total_tickets_sold || 0,
          totalRevenue: data.total_revenue || 0,
          ticketTypeStats: safeJsonParse(data.ticket_type_stats, []),
          dailySales: safeJsonParse(data.daily_sales, []),
          lastUpdated: data.last_updated,
        };
      }
      return {
        eventId: input.eventId,
        totalTicketsSold: 0,
        totalRevenue: 0,
        ticketTypeStats: [],
        dailySales: [],
        lastUpdated: new Date(),
      };
    } catch {
      return {
        eventId: input.eventId,
        totalTicketsSold: 0,
        totalRevenue: 0,
        ticketTypeStats: [],
        dailySales: [],
        lastUpdated: new Date(),
      };
    }
  },

  trackView: async (input: { eventId: string; sessionId: string }): Promise<{ success: boolean }> => {
    try {
      await supabase.from('event_views').upsert({
        id: `${input.eventId}_${input.sessionId}`,
        event_id: input.eventId,
        session_id: input.sessionId,
        user_id: null,
        viewed_at: new Date().toISOString(),
        last_active_at: new Date().toISOString(),
      });
      return { success: true };
    } catch {
      return { success: true };
    }
  },

  getActiveViewers: async (input: { eventId: string }): Promise<{ activeViewers: number }> => {
    try {
      const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      const { count } = await supabase
        .from('event_views')
        .select('*', { count: 'exact', head: true })
        .eq('event_id', input.eventId)
        .gte('last_active_at', fiveMinAgo);

      return { activeViewers: count || 0 };
    } catch {
      return { activeViewers: 0 };
    }
  },
};

export const authApi = {
  login: async (input: { email: string; password: string }): Promise<any> => {
    console.log('[authApi.login] Attempting Supabase Auth login...');
    try {
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: input.email,
        password: input.password,
      });

      if (authError) {
        console.log('[authApi.login] Supabase Auth failed:', authError.message);
        if (authError.message.includes('Invalid login credentials') || authError.message.includes('invalid')) {
          throw new Error('Credenciais inválidas. Verifica o email e palavra-passe.');
        }
        throw new Error(authError.message);
      }

      if (!authData.user) {
        throw new Error('Credenciais inválidas.');
      }

      const supaUser = authData.user;
      console.log('[authApi.login] success:', supaUser.id);

      const { data: sessionData } = await supabase.auth.getSession();
      console.log('[authApi.login] session confirmed:', !!sessionData?.session, '| uid:', sessionData?.session?.user?.id);

      let profileData: any = null;

      const fetchProfile = async (attempt: number): Promise<any> => {
        console.log('[authApi.login] fetchProfile attempt', attempt);
        const { data: profileById, error: errById } = await supabase
          .from('users')
          .select('*')
          .eq('id', supaUser.id)
          .maybeSingle();
        console.log('[authApi.login] profile by id:', profileById ? 'found' : 'not found', '| error:', errById?.message || 'none', '| code:', errById?.code || 'none');
        if (profileById) return profileById;

        const { data: profileByEmail, error: errByEmail } = await supabase
          .from('users')
          .select('*')
          .eq('email', input.email.toLowerCase())
          .maybeSingle();
        console.log('[authApi.login] profile by email:', profileByEmail ? 'found' : 'not found', '| error:', errByEmail?.message || 'none', '| code:', errByEmail?.code || 'none');
        if (profileByEmail) return profileByEmail;

        return null;
      };

      profileData = await fetchProfile(1);

      if (!profileData) {
        console.log('[authApi.login] Profile not found on 1st attempt, waiting 500ms and retrying...');
        await new Promise(resolve => setTimeout(resolve, 500));
        profileData = await fetchProfile(2);
      }

      if (!profileData) {
        console.log('[authApi.login] Profile not found on 2nd attempt, waiting 1000ms and retrying...');
        await new Promise(resolve => setTimeout(resolve, 1000));
        profileData = await fetchProfile(3);
      }

      const meta = supaUser.user_metadata || {};
      const appMeta = supaUser.app_metadata || {};
      const resolvedUserType = profileData?.user_type || meta.userType || meta.user_type || appMeta.user_type || appMeta.role || 'normal';
      console.log('[authApi.login] resolvedUserType:', resolvedUserType, '| profileData:', JSON.stringify(profileData ? { id: profileData.id, user_type: profileData.user_type, email: profileData.email } : null), '| meta.userType:', meta.userType, '| meta.user_type:', meta.user_type, '| appMeta.user_type:', appMeta.user_type, '| appMeta.role:', appMeta.role);
      const user = {
        id: profileData?.id || supaUser.id,
        name: profileData?.name || meta.name || meta.full_name || input.email.split('@')[0],
        email: supaUser.email || input.email,
        userType: resolvedUserType,
        isOnboardingComplete: profileData?.is_onboarding_complete ? 1 : 0,
        phone: profileData?.phone || meta.phone || null,
        interests: profileData?.interests || '[]',
        locationLatitude: profileData?.location_latitude || null,
        locationLongitude: profileData?.location_longitude || null,
        locationCity: profileData?.location_city || null,
        locationRegion: profileData?.location_region || null,
        preferencesNotifications: profileData?.preferences_notifications ? 1 : 0,
        preferencesLanguage: profileData?.preferences_language || 'pt',
        preferencesPriceMin: profileData?.preferences_price_min || 0,
        preferencesPriceMax: profileData?.preferences_price_max || 1000,
        preferencesEventTypes: profileData?.preferences_event_types || '[]',
        favoriteEvents: profileData?.favorite_events || '[]',
        eventHistory: profileData?.event_history || '[]',
        createdAt: profileData?.created_at || supaUser.created_at,
      };

      return { success: true, user };
    } catch (err) {
      console.error('[authApi.login] error:', err);
      throw err;
    }
  },

  sendVerificationCode: async (input: { email: string; name: string; password: string }): Promise<{ success: boolean; emailSent?: boolean; emailError?: string }> => {
    console.log('[authApi.sendVerificationCode] Storing code in Supabase for:', input.email);
    try {
      const code = Math.floor(100000 + Math.random() * 900000).toString();
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

      const { error: deleteError } = await supabase.from('verification_codes').delete().eq('email', input.email.toLowerCase());
      if (deleteError) {
        console.warn('[authApi.sendVerificationCode] delete old codes warning:', deleteError.message, deleteError.code, deleteError.details);
      }

      const insertPayload = {
        id: genId('vc'),
        email: input.email.toLowerCase(),
        code,
        name: input.name,
        password: input.password,
        expires_at: expiresAt,
        is_used: false,
      };
      console.log('[authApi.sendVerificationCode] Inserting verification code...');

      const { error } = await supabase.from('verification_codes').insert(insertPayload);

      if (error) {
        console.error('[authApi.sendVerificationCode] insert error:', error.message, '| code:', error.code, '| details:', error.details, '| hint:', error.hint);
        if (error.code === '42501' || error.message?.includes('policy')) {
          throw new Error('Erro de permissão na base de dados. Contacte o suporte.');
        }
        if (error.code === '42P01') {
          throw new Error('Tabela de verificação não encontrada. Contacte o suporte.');
        }
        throw new Error('Falha ao gerar código de verificação. Tente novamente.');
      }

      console.log(`[authApi.sendVerificationCode] Code stored successfully for ${input.email}`);

      console.log('[authApi.sendVerificationCode] Sending verification email via Supabase Edge Function...');
      try {
        const result = await sendEmail({
          type: 'sendVerificationCode',
          email: input.email.toLowerCase(),
          code,
          name: input.name,
        });
        if (result.success) {
          console.log('[authApi.sendVerificationCode] Email sent successfully');
          return { success: true, emailSent: true };
        }
        console.warn('[authApi.sendVerificationCode] Email send failed:', result.error);
        return { success: true, emailSent: false, emailError: result.error || 'Erro ao enviar email' };
      } catch (emailErr: any) {
        console.warn('[authApi.sendVerificationCode] Failed to send email (code still stored):', emailErr?.message);
        return { success: true, emailSent: false, emailError: emailErr?.message || 'Erro ao enviar email' };
      }
    } catch (err: any) {
      console.error('[authApi.sendVerificationCode] error:', err?.message || err);
      if (err?.message?.includes('NetworkError') || err?.message?.includes('fetch')) {
        throw new Error('Erro de conexão. Verifique a sua internet e tente novamente.');
      }
      throw err;
    }
  },

  verifyCode: async (input: { email: string; code: string }): Promise<{ success: boolean; verified: boolean; userData?: { name: string; password: string } }> => {
    console.log('[authApi.verifyCode] Verifying code for:', input.email);
    try {
      const { data: record, error } = await supabase
        .from('verification_codes')
        .select('*')
        .eq('email', input.email.toLowerCase())
        .eq('is_used', false)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (error || !record) {
        console.log('[authApi.verifyCode] No record found');
        throw new Error('Código inválido ou expirado. Solicite um novo código.');
      }

      if (new Date() > new Date(record.expires_at)) {
        console.log('[authApi.verifyCode] Code expired');
        await supabase.from('verification_codes').update({ is_used: true }).eq('id', record.id);
        throw new Error('Código expirado. Solicite um novo código.');
      }

      if (record.code !== input.code) {
        console.log('[authApi.verifyCode] Invalid code');
        throw new Error('Código inválido. Tente novamente.');
      }

      await supabase.from('verification_codes').update({ is_used: true }).eq('id', record.id);
      console.log('[authApi.verifyCode] Code verified successfully');

      return {
        success: true,
        verified: true,
        userData: { name: record.name, password: record.password },
      };
    } catch (err: any) {
      console.error('[authApi.verifyCode] error:', err);
      throw err;
    }
  },
};

export const usersApi = {
  create: async (input: any): Promise<any> => {
    const userId = input.id || genId('user');
    const userType = input.userType || 'normal';
    console.log('[usersApi.create] Creating user:', { id: userId, email: input.email, userType });

    try {
      const { data, error } = await supabase.from('users').upsert({
        id: userId,
        name: input.name,
        email: input.email?.toLowerCase(),
        phone: input.phone || null,
        user_type: userType,
        interests: JSON.stringify(input.interests || []),
        is_onboarding_complete: input.isOnboardingComplete || false,
        created_at: new Date().toISOString(),
      }).select().single();

      if (error) {
        console.error('[usersApi.create] Upsert error:', error.message, '| code:', error.code, '| details:', error.details, '| hint:', error.hint);

        console.log('[usersApi.create] Retrying with INSERT...');
        const { data: insertData, error: insertError } = await supabase.from('users').insert({
          id: userId,
          name: input.name,
          email: input.email?.toLowerCase(),
          phone: input.phone || null,
          user_type: userType,
          interests: JSON.stringify(input.interests || []),
          is_onboarding_complete: input.isOnboardingComplete || false,
          created_at: new Date().toISOString(),
        }).select().single();

        if (insertError) {
          console.error('[usersApi.create] INSERT also failed:', insertError.message, '| code:', insertError.code);

          const { data: existing } = await supabase.from('users').select('*').eq('id', userId).maybeSingle();
          if (existing) {
            console.log('[usersApi.create] User already exists, updating user_type to:', userType);
            const { error: updateError } = await supabase.from('users').update({ user_type: userType }).eq('id', userId);
            if (updateError) {
              console.error('[usersApi.create] Update user_type failed:', updateError.message);
            }
            return { ...existing, user_type: userType };
          }

          return { id: userId, ...input, user_type: userType };
        }
        console.log('[usersApi.create] INSERT succeeded:', insertData?.id);
        return insertData || { id: userId, ...input };
      }
      console.log('[usersApi.create] Upsert succeeded:', data?.id, 'user_type:', data?.user_type);
      return data || { id: userId, ...input };
    } catch (err: any) {
      console.error('[usersApi.create] Unexpected error:', err?.message || err);
      return { id: userId, ...input, user_type: userType };
    }
  },

  get: async (input: { id: string }): Promise<any> => {
    try {
      const { data } = await supabase.from('users').select('*').eq('id', input.id).single();
      return data;
    } catch {
      return null;
    }
  },

  list: async (input?: { limit?: number }): Promise<any[]> => {
    try {
      let query = supabase.from('users').select('*').order('created_at', { ascending: false });
      if (input?.limit) query = query.limit(input.limit);
      const { data, error } = await query;
      if (error) return [];
      return data || [];
    } catch {
      return [];
    }
  },

  update: async (input: any): Promise<any> => {
    try {
      const { id, ...rest } = input;
      const updates: Record<string, any> = {};
      if (rest.name !== undefined) updates.name = rest.name;
      if (rest.email !== undefined) updates.email = rest.email;
      if (rest.phone !== undefined) updates.phone = rest.phone;
      if (rest.interests !== undefined) updates.interests = typeof rest.interests === 'string' ? rest.interests : JSON.stringify(rest.interests);
      if (rest.locationLatitude !== undefined) updates.location_latitude = rest.locationLatitude;
      if (rest.locationLongitude !== undefined) updates.location_longitude = rest.locationLongitude;
      if (rest.locationCity !== undefined) updates.location_city = rest.locationCity;
      if (rest.locationRegion !== undefined) updates.location_region = rest.locationRegion;
      if (rest.preferencesNotifications !== undefined) updates.preferences_notifications = rest.preferencesNotifications;
      if (rest.preferencesLanguage !== undefined) updates.preferences_language = rest.preferencesLanguage;
      if (rest.preferencesPriceMin !== undefined) updates.preferences_price_min = rest.preferencesPriceMin;
      if (rest.preferencesPriceMax !== undefined) updates.preferences_price_max = rest.preferencesPriceMax;
      if (rest.preferencesEventTypes !== undefined) updates.preferences_event_types = typeof rest.preferencesEventTypes === 'string' ? rest.preferencesEventTypes : JSON.stringify(rest.preferencesEventTypes);
      if (rest.userType !== undefined) updates.user_type = rest.userType;
      if (rest.isOnboardingComplete !== undefined) updates.is_onboarding_complete = rest.isOnboardingComplete;

      if (Object.keys(updates).length === 0) throw new Error('No fields to update');

      const { data, error } = await supabase.from('users').update(updates).eq('id', id).select().single();
      if (error) throw error;
      return data;
    } catch (err) {
      console.error('[usersApi.update] error:', err);
      throw err;
    }
  },

  delete: async (input: { id: string }): Promise<{ success: boolean }> => {
    try {
      const { error } = await supabase.from('users').delete().eq('id', input.id);
      if (error) throw error;
      return { success: true };
    } catch (err) {
      console.error('[usersApi.delete] error:', err);
      throw err;
    }
  },

  updateOnboarding: async (input: any): Promise<{ success: boolean }> => {
    try {
      await supabase.from('users').update({
        phone: input.phone,
        interests: JSON.stringify(input.interests || []),
        location_city: input.locationCity,
        location_region: input.locationRegion,
        location_latitude: input.locationLatitude,
        location_longitude: input.locationLongitude,
        preferences_notifications: input.preferencesNotifications,
        preferences_language: input.preferencesLanguage,
        preferences_price_min: input.preferencesPriceMin,
        preferences_price_max: input.preferencesPriceMax,
        preferences_event_types: JSON.stringify(input.preferencesEventTypes || []),
        is_onboarding_complete: true,
      }).eq('id', input.id);
      return { success: true };
    } catch {
      return { success: true };
    }
  },
};

export const ticketsApi = {
  create: async (input: any): Promise<any> => {
    try {
      const { data, error } = await supabase.from('tickets').insert({
        id: input.id,
        event_id: input.eventId,
        user_id: input.userId,
        ticket_type_id: input.ticketTypeId,
        quantity: input.quantity,
        price: input.price,
        qr_code: input.qrCode,
        is_used: false,
        valid_until: input.validUntil,
        purchase_date: new Date().toISOString(),
      }).select().single();

      if (error) throw error;

      try {
        const { data: event } = await supabase.from('events').select('title, promoter_id').eq('id', input.eventId).single();
        if (event?.promoter_id) {
          await supabase.from('notifications').insert({
            id: genId('notif'),
            user_id: event.promoter_id,
            type: 'ticket_sold',
            title: 'Novo Bilhete Vendido! 🎫',
            message: `${input.quantity} bilhete(s) vendido(s) para "${event.title}" - €${input.price.toFixed(2)}`,
            data: JSON.stringify({ eventId: input.eventId, ticketId: input.id, quantity: input.quantity, price: input.price }),
            is_read: false,
          });
        }
      } catch { /* notification is non-critical */ }

      return data;
    } catch (err) {
      console.error('[ticketsApi.create] error:', err);
      throw err;
    }
  },

  batchCreate: async (input: { tickets: any[] }): Promise<{ success: boolean }> => {
    try {
      const rows = input.tickets.map(t => ({
        id: t.id,
        event_id: t.eventId,
        user_id: t.userId,
        ticket_type_id: t.ticketTypeId,
        quantity: t.quantity,
        price: t.price,
        qr_code: t.qrCode,
        valid_until: t.validUntil,
        purchase_date: new Date().toISOString(),
      }));
      const { error } = await supabase.from('tickets').insert(rows);
      if (error) {
        console.error('[ticketsApi.batchCreate] error:', error.message);
        throw error;
      }
      console.log('[ticketsApi.batchCreate] success:', rows.length, 'tickets created');
      return { success: true };
    } catch (err) {
      console.error('[ticketsApi.batchCreate] error:', err);
      throw err;
    }
  },

  get: async (input: { id: string }): Promise<any> => {
    try {
      const { data } = await supabase.from('tickets').select('*').eq('id', input.id).single();
      if (!data) return null;
      return {
        id: data.id, eventId: data.event_id, userId: data.user_id, ticketTypeId: data.ticket_type_id,
        quantity: data.quantity, price: data.price, qrCode: data.qr_code, isUsed: data.is_used,
        validatedAt: data.validated_at, validatedBy: data.validated_by, purchaseDate: data.purchase_date,
        validUntil: data.valid_until, addedToCalendar: data.added_to_calendar, reminderSet: data.reminder_set,
      };
    } catch {
      return null;
    }
  },

  list: async (input: { userId: string }): Promise<any[]> => {
    try {
      const { data, error } = await supabase
        .from('tickets')
        .select('*')
        .eq('user_id', input.userId)
        .order('purchase_date', { ascending: false });

      if (error || !data) return [];
      return data.map((t: any) => ({
        id: t.id, eventId: t.event_id, userId: t.user_id, ticketTypeId: t.ticket_type_id,
        quantity: t.quantity, price: t.price, qrCode: t.qr_code, isUsed: t.is_used,
        validatedAt: t.validated_at, validatedBy: t.validated_by, purchaseDate: t.purchase_date,
        validUntil: t.valid_until, addedToCalendar: t.added_to_calendar, reminderSet: t.reminder_set,
      }));
    } catch {
      return [];
    }
  },

  validate: async (input: { ticketId?: string; qrCode?: string; validatorId?: string }): Promise<any> => {
    try {
      let query = supabase.from('tickets').select(`
        *,
        users:user_id (id, name, email)
      `);
      if (input.ticketId) query = query.eq('id', input.ticketId);
      if (input.qrCode) query = query.eq('qr_code', input.qrCode);

      const { data, error } = await query.single();
      if (error || !data) return { valid: false, message: 'Bilhete não encontrado' };
      if (data.is_used) {
        return {
          valid: false,
          message: 'Bilhete já utilizado',
          ticket: {
            id: data.id, eventId: data.event_id, userId: data.user_id,
            ticketTypeId: data.ticket_type_id, quantity: data.quantity, price: data.price,
            qrCode: data.qr_code, isUsed: data.is_used,
            validatedAt: data.validated_at, validatedBy: data.validated_by,
            purchaseDate: data.purchase_date, validUntil: data.valid_until,
          },
          buyer: data.users ? { id: (data.users as any).id, name: (data.users as any).name, email: (data.users as any).email } : null,
        };
      }

      // Check expiry
      if (data.valid_until && new Date(data.valid_until) < new Date()) {
        return {
          valid: false,
          message: 'Bilhete expirado',
          ticket: {
            id: data.id, eventId: data.event_id, userId: data.user_id,
            ticketTypeId: data.ticket_type_id, quantity: data.quantity, price: data.price,
            qrCode: data.qr_code, isUsed: data.is_used,
            validatedAt: data.validated_at, validatedBy: data.validated_by,
            purchaseDate: data.purchase_date, validUntil: data.valid_until,
          },
        };
      }

      const nowIso = new Date().toISOString();
      await supabase.from('tickets')
        .update({ is_used: true, validated_at: nowIso, validated_by: input.validatorId ?? null })
        .eq('id', data.id);

      return {
        valid: true,
        message: 'Bilhete válido!',
        ticket: {
          id: data.id, eventId: data.event_id, userId: data.user_id,
          ticketTypeId: data.ticket_type_id, quantity: data.quantity, price: data.price,
          qrCode: data.qr_code, isUsed: true,
          validatedAt: nowIso, validatedBy: input.validatorId ?? null,
          purchaseDate: data.purchase_date, validUntil: data.valid_until,
        },
        buyer: data.users ? { id: (data.users as any).id, name: (data.users as any).name, email: (data.users as any).email } : null,
      };
    } catch {
      return { valid: false, message: 'Erro ao validar bilhete' };
    }
  },

  cancel: async (input: { ticketId: string }): Promise<{ success: boolean }> => {
    try {
      const { error } = await supabase.from('tickets').delete().eq('id', input.ticketId);
      if (error) throw error;
      return { success: true };
    } catch (err) {
      console.error('[ticketsApi.cancel] error:', err);
      throw err;
    }
  },

  transfer: async (input: { ticketId: string; toUserId: string }): Promise<{ success: boolean }> => {
    try {
      const { error } = await supabase.from('tickets').update({ user_id: input.toUserId }).eq('id', input.ticketId);
      if (error) throw error;
      return { success: true };
    } catch (err) {
      console.error('[ticketsApi.transfer] error:', err);
      throw err;
    }
  },

  addToCalendar: async (input: { ticketId: string }): Promise<{ success: boolean }> => {
    try {
      await supabase.from('tickets').update({ added_to_calendar: true }).eq('id', input.ticketId);
      return { success: true };
    } catch {
      return { success: true };
    }
  },

  setReminder: async (input: { ticketId: string }): Promise<{ success: boolean }> => {
    try {
      await supabase.from('tickets').update({ reminder_set: true }).eq('id', input.ticketId);
      return { success: true };
    } catch {
      return { success: true };
    }
  },

  generateWalletPass: async (_input: { ticketId: string }): Promise<{ success: boolean; passUrl?: string }> => {
    return { success: false, passUrl: undefined };
  },
};

export const promotersApi = {
  create: async (input: any): Promise<any> => {
    try {
      const id = genId('promoter');
      const { data, error } = await supabase.from('promoter_profiles').insert({
        id,
        user_id: input.userId,
        company_name: input.companyName,
        description: input.description || '',
        website: input.website || null,
        instagram_handle: input.instagramHandle || null,
        facebook_handle: input.facebookHandle || null,
        twitter_handle: input.twitterHandle || null,
        is_approved: false,
        events_created: '[]',
        followers: '[]',
        rating: 0,
        total_events: 0,
      }).select().single();

      if (error) throw error;
      return { id, promoter: data };
    } catch (err) {
      console.error('[promotersApi.create] error:', err);
      throw err;
    }
  },

  get: async (input: { id: string }): Promise<any> => {
    try {
      const { data } = await supabase.from('promoters').select('*').eq('id', input.id).single();
      if (!data) return null;
      return {
        id: data.id, name: data.name, image: data.image, description: data.description,
        verified: data.verified, followersCount: data.followers_count,
      };
    } catch {
      return null;
    }
  },

  getByUserId: async (input: { userId: string }): Promise<any> => {
    try {
      console.log('[promotersApi.getByUserId] Looking up profiles for user:', input.userId);
      
      const { data: allProfiles, error } = await supabase
        .from('promoter_profiles')
        .select('*')
        .eq('user_id', input.userId);

      if (error) {
        console.error('[promotersApi.getByUserId] query error:', error.message);
        return null;
      }

      if (!allProfiles || allProfiles.length === 0) {
        console.log('[promotersApi.getByUserId] No profiles found for user:', input.userId);
        return null;
      }

      const approvedProfile = allProfiles.find((p: any) => p.is_approved === true);
      const data = approvedProfile || allProfiles[0];
      console.log('[promotersApi.getByUserId] Found', allProfiles.length, 'profiles, using:', data.id, 'is_approved:', data.is_approved);

      let promoterData = null;
      try {
        const { data: pData } = await supabase.from('promoters').select('*').eq('id', data.id).maybeSingle();
        if (pData) {
          promoterData = {
            id: pData.id, name: pData.name, image: pData.image,
            description: pData.description, verified: pData.verified,
            followersCount: pData.followers_count,
          };
        }
      } catch {
        console.warn('[promotersApi.getByUserId] Could not fetch promoter record');
      }

      return {
        id: data.id, userId: data.user_id, companyName: data.company_name, description: data.description,
        website: data.website, instagramHandle: data.instagram_handle, facebookHandle: data.facebook_handle,
        twitterHandle: data.twitter_handle, isApproved: data.is_approved === true,
        promoter: promoterData,
      };
    } catch (err) {
      console.error('[promotersApi.getByUserId] error:', err);
      return null;
    }
  },

  update: async (input: any): Promise<any> => {
    try {
      const { id, ...rest } = input;
      const updates: Record<string, any> = {};
      if (rest.companyName !== undefined) updates.company_name = rest.companyName;
      if (rest.description !== undefined) updates.description = rest.description;
      if (rest.website !== undefined) updates.website = rest.website;
      if (rest.instagramHandle !== undefined) updates.instagram_handle = rest.instagramHandle;
      if (rest.facebookHandle !== undefined) updates.facebook_handle = rest.facebookHandle;
      if (rest.twitterHandle !== undefined) updates.twitter_handle = rest.twitterHandle;

      if (Object.keys(updates).length === 0) throw new Error('No fields to update');

      const { data, error } = await supabase.from('promoter_profiles').update(updates).eq('id', id).select().single();
      if (error) throw error;
      return data;
    } catch (err) {
      console.error('[promotersApi.update] error:', err);
      throw err;
    }
  },

  delete: async (input: { id: string }): Promise<{ success: boolean }> => {
    try {
      const { error } = await supabase.from('promoter_profiles').delete().eq('id', input.id);
      if (error) throw error;
      return { success: true };
    } catch (err) {
      console.error('[promotersApi.delete] error:', err);
      throw err;
    }
  },

  list: async (): Promise<any[]> => {
    try {
      const { data } = await supabase.from('promoters').select('*');
      return (data || []).map((p: any) => ({
        id: p.id, name: p.name, image: p.image, description: p.description,
        verified: p.verified, followersCount: p.followers_count,
      }));
    } catch {
      return [];
    }
  },

  listPending: async (input?: { limit?: number; offset?: number }): Promise<{ promoters: any[]; total: number }> => {
    try {
      console.log('[promotersApi.listPending] Fetching pending promoter profiles...');
      let query = supabase.from('promoter_profiles').select('*').eq('is_approved', false);
      if (input?.limit) query = query.limit(input.limit);
      if (input?.offset) query = query.range(input.offset, input.offset + (input.limit || 20) - 1);

      const { data, error } = await query;
      if (error) {
        console.error('[promotersApi.listPending] promoter_profiles error:', error.message, error.code, error.details);
      }
      console.log('[promotersApi.listPending] promoter_profiles found:', (data || []).length);
      if (data && data.length > 0) {
        console.log('[promotersApi.listPending] First profile:', JSON.stringify(data[0]));
      }

      const { data: promoterUsers, error: usersError } = await supabase
        .from('users')
        .select('id, name, email, user_type, created_at')
        .eq('user_type', 'promoter');

      if (usersError) {
        console.error('[promotersApi.listPending] users query error:', usersError.message);
      }
      console.log('[promotersApi.listPending] promoter users found:', (promoterUsers || []).length);

      const profileUserIds = new Set((data || []).map((p: any) => p.user_id));
      const approvedProfileUserIds = new Set<string>();

      const { data: approvedProfiles } = await supabase
        .from('promoter_profiles')
        .select('user_id')
        .eq('is_approved', true);
      if (approvedProfiles) {
        approvedProfiles.forEach((p: any) => approvedProfileUserIds.add(p.user_id));
      }

      const orphanedPromoters = (promoterUsers || []).filter(
        (u: any) => !profileUserIds.has(u.id) && !approvedProfileUserIds.has(u.id)
      );
      console.log('[promotersApi.listPending] orphaned promoter users (no profile):', orphanedPromoters.length);

      for (const orphan of orphanedPromoters) {
        try {
          const profileId = genId('promoter');
          const { error: insertError } = await supabase.from('promoter_profiles').insert({
            id: profileId,
            user_id: orphan.id,
            company_name: orphan.name || 'Sem nome',
            description: '',
            is_approved: false,
            events_created: '[]',
            followers: '[]',
            rating: 0,
            total_events: 0,
          });
          if (insertError) {
            console.error('[promotersApi.listPending] Failed to create profile for orphan:', orphan.id, insertError.message);
          } else {
            console.log('[promotersApi.listPending] Created missing profile for:', orphan.email);
            if (data) {
              data.push({
                id: profileId,
                user_id: orphan.id,
                company_name: orphan.name || 'Sem nome',
                description: '',
                is_approved: false,
                created_at: orphan.created_at || new Date().toISOString(),
              } as any);
            }
          }
        } catch (createErr) {
          console.error('[promotersApi.listPending] Error creating orphan profile:', createErr);
        }
      }

      const allPending = (data || []).filter((p: any) => !p.is_approved);
      const userIds = allPending.map((p: any) => p.user_id).filter(Boolean);
      let usersMap: Record<string, { name: string; email: string }> = {};
      if (userIds.length > 0) {
        const { data: usersData } = await supabase.from('users').select('id, name, email').in('id', userIds);
        if (usersData) {
          usersMap = usersData.reduce((acc: Record<string, any>, u: any) => {
            acc[u.id] = { name: u.name, email: u.email };
            return acc;
          }, {});
        }
      }

      const promoters = allPending.map((p: any) => ({
        ...p,
        user_name: usersMap[p.user_id]?.name || null,
        user_email: usersMap[p.user_id]?.email || null,
      }));
      console.log('[promotersApi.listPending] Total pending promoters:', promoters.length);
      return { promoters, total: promoters.length };
    } catch (err) {
      console.error('[promotersApi.listPending] error:', err);
      return { promoters: [], total: 0 };
    }
  },

  approve: async (input: { id: string }): Promise<{ success: boolean; promoter?: any }> => {
    try {
      const { data: profile } = await supabase.from('promoter_profiles').select('*').eq('id', input.id).single();
      if (!profile) throw new Error('Perfil de promotor não encontrado');

      console.log('[promotersApi.approve] Approving promoter profile:', input.id, 'user_id:', profile.user_id);

      let updateData: Record<string, any> = { is_approved: true };
      try {
        updateData.approval_date = new Date().toISOString();
      } catch {}

      const { data, error } = await supabase.from('promoter_profiles')
        .update(updateData)
        .eq('id', input.id)
        .select()
        .single();

      if (error && error.message?.includes('approval_date')) {
        console.warn('[promotersApi.approve] approval_date column may not exist, retrying without it');
        const { data: retryData, error: retryError } = await supabase.from('promoter_profiles')
          .update({ is_approved: true })
          .eq('id', input.id)
          .select()
          .single();
        if (retryError) throw retryError;
        Object.assign(data || {}, retryData);
      }

      if (error) throw error;

      if (profile.user_id) {
        const { data: duplicates } = await supabase
          .from('promoter_profiles')
          .select('id')
          .eq('user_id', profile.user_id)
          .neq('id', input.id);
        if (duplicates && duplicates.length > 0) {
          console.log('[promotersApi.approve] Cleaning up', duplicates.length, 'duplicate profiles');
          for (const dup of duplicates) {
            await supabase.from('promoter_profiles').delete().eq('id', dup.id);
          }
        }
      }

      const { data: existingPromoter } = await supabase
        .from('promoters')
        .select('id')
        .eq('id', input.id)
        .maybeSingle();

      if (!existingPromoter) {
        console.log('[promotersApi.approve] Creating promoters table record...');
        const { error: promoterError } = await supabase.from('promoters').insert({
          id: input.id,
          name: profile.company_name || 'Promotor',
          image: '',
          description: profile.description || '',
          verified: false,
          followers_count: 0,
        });
        if (promoterError) {
          console.error('[promotersApi.approve] Error creating promoters record:', promoterError.message);
        } else {
          console.log('[promotersApi.approve] Promoters record created successfully');
        }
      }

      if (profile.user_id) {
        await supabase.from('notifications').insert({
          id: genId('notif'),
          user_id: profile.user_id,
          type: 'system',
          title: 'Perfil de Promotor Aprovado! 🎉',
          message: 'O seu perfil de promotor foi aprovado! Já pode criar eventos.',
          is_read: false,
        });

        await supabase.from('users')
          .update({ user_type: 'promoter' })
          .eq('id', profile.user_id);
        console.log('[promotersApi.approve] User type confirmed as promoter for:', profile.user_id);

        let promoterEmail = '';
        let promoterName = profile.company_name || 'Promotor';
        const { data: userData } = await supabase.from('users').select('email, name').eq('id', profile.user_id).single();
        if (userData) {
          promoterEmail = userData.email;
          promoterName = userData.name || promoterName;
        }

        if (promoterEmail) {
          try {
            console.log('[promotersApi.approve] Sending approval email to:', promoterEmail);
            await sendEmail({
              type: 'sendPromoterApprovalEmail',
              promoterName,
              promoterEmail,
            });
          } catch (emailErr: any) {
            console.warn('[promotersApi.approve] Failed to send approval email:', emailErr?.message);
          }
        }
      }

      return { success: true, promoter: data };
    } catch (err) {
      console.error('[promotersApi.approve] error:', err);
      throw err;
    }
  },

  reject: async (input: { id: string; reason?: string }): Promise<{ success: boolean }> => {
    try {
      const { data: promoter } = await supabase.from('promoter_profiles').select('user_id').eq('id', input.id).single();

      if (promoter?.user_id) {
        await supabase.from('notifications').insert({
          id: genId('notif'),
          user_id: promoter.user_id,
          type: 'system',
          title: 'Perfil de Promotor Rejeitado',
          message: input.reason || 'O seu perfil de promotor foi rejeitado. Contacte o suporte.',
          is_read: false,
        });
      }

      await supabase.from('promoter_profiles').delete().eq('id', input.id);
      return { success: true };
    } catch (err) {
      console.error('[promotersApi.reject] error:', err);
      throw err;
    }
  },

  stats: async (input: { id: string }): Promise<any> => {
    try {
      const { data: promoterEvents } = await supabase.from('events').select('id').eq('promoter_id', input.id);
      const eventIds = (promoterEvents || []).map((e: any) => e.id);

      let totalTicketsSold = 0;
      let totalRevenue = 0;

      if (eventIds.length > 0) {
        const { data: eventTickets } = await supabase.from('tickets').select('quantity, price').in('event_id', eventIds);
        if (eventTickets) {
          totalTicketsSold = eventTickets.reduce((sum: number, t: any) => sum + (t.quantity || 0), 0);
          totalRevenue = eventTickets.reduce((sum: number, t: any) => sum + ((t.price || 0) * (t.quantity || 0)), 0);
        }
      }

      const { count: followersCount } = await supabase
        .from('following')
        .select('*', { count: 'exact', head: true })
        .eq('promoter_id', input.id);

      const now = new Date().toISOString();
      const { count: upcomingEvents } = await supabase
        .from('events')
        .select('*', { count: 'exact', head: true })
        .eq('promoter_id', input.id)
        .eq('status', 'published')
        .gte('date', now);

      return {
        totalEvents: eventIds.length,
        totalTicketsSold,
        totalRevenue,
        averageRating: 0,
        followersCount: followersCount || 0,
        upcomingEvents: upcomingEvents || 0,
      };
    } catch {
      return { totalEvents: 0, totalTicketsSold: 0, totalRevenue: 0, averageRating: 0, followersCount: 0, upcomingEvents: 0 };
    }
  },
};

export const advertisementsApi = {
  create: async (input: any): Promise<any> => {
    try {
      const id = genId('ad');
      const { data, error } = await supabase.from('advertisements').insert({
        id,
        title: input.title,
        description: input.description || '',
        image: input.image || '',
        target_url: input.targetUrl || null,
        type: input.type,
        position: input.position,
        start_date: input.startDate,
        end_date: input.endDate,
        budget: input.budget,
        promoter_id: input.promoterId || null,
        target_audience_interests: input.targetAudienceInterests || null,
        target_audience_age_min: input.targetAudienceAgeMin || null,
        target_audience_age_max: input.targetAudienceAgeMax || null,
        target_audience_location: input.targetAudienceLocation || null,
        is_active: input.isActive === true ? true : false,
        impressions: 0,
        clicks: 0,
      }).select().single();

      if (error) throw error;
      return data;
    } catch (err) {
      console.error('[advertisementsApi.create] error:', err);
      throw err;
    }
  },

  get: async (input: { id: string }): Promise<any> => {
    try {
      const { data } = await supabase.from('advertisements').select('*').eq('id', input.id).single();
      return data || null;
    } catch {
      return null;
    }
  },

  update: async (input: any): Promise<any> => {
    try {
      const { id, ...rest } = input;
      const updates: Record<string, any> = {};
      if (rest.title !== undefined) updates.title = rest.title;
      if (rest.description !== undefined) updates.description = rest.description;
      if (rest.image !== undefined) updates.image = rest.image;
      if (rest.targetUrl !== undefined) updates.target_url = rest.targetUrl;
      if (rest.type !== undefined) updates.type = rest.type;
      if (rest.position !== undefined) updates.position = rest.position;
      if (rest.startDate !== undefined) updates.start_date = rest.startDate;
      if (rest.endDate !== undefined) updates.end_date = rest.endDate;
      if (rest.budget !== undefined) updates.budget = rest.budget;
      if (rest.isActive !== undefined) updates.is_active = rest.isActive;

      const { data, error } = await supabase.from('advertisements').update(updates).eq('id', id).select().single();
      if (error) throw error;
      return data;
    } catch (err) {
      console.error('[advertisementsApi.update] error:', err);
      throw err;
    }
  },

  delete: async (input: { id: string }): Promise<{ success: boolean }> => {
    try {
      await supabase.from('advertisements').delete().eq('id', input.id);
      return { success: true };
    } catch (err) {
      console.error('[advertisementsApi.delete] error:', err);
      throw err;
    }
  },

  list: async (input?: { limit?: number; offset?: number; type?: string; position?: string; active?: boolean; promoterId?: string }): Promise<{ ads: any[]; total: number }> => {
    try {
      console.log('[advertisementsApi.list] called with input:', JSON.stringify(input));
      let query = supabase.from('advertisements').select('*');

      if (input?.type) query = query.eq('type', input.type);
      if (input?.position) query = query.eq('position', input.position);
      if (input?.active !== undefined) query = query.eq('is_active', input.active);
      if (input?.promoterId) query = query.eq('promoter_id', input.promoterId);
      if (input?.limit) query = query.limit(input.limit);
      if (input?.offset) query = query.range(input.offset, input.offset + (input.limit || 20) - 1);

      const { data, error } = await query;
      console.log('[advertisementsApi.list] result:', { count: data?.length, error: error?.message });
      if (error) {
        console.error('[advertisementsApi.list] Supabase error:', error.message);
        return { ads: [], total: 0 };
      }
      console.log('[advertisementsApi.list] returning ads:', (data || []).map((a: any) => ({ id: a.id, title: a.title, is_active: a.is_active })));
      return { ads: data || [], total: (data || []).length };
    } catch (err) {
      console.error('[advertisementsApi.list] error:', err);
      return { ads: [], total: 0 };
    }
  },

  listPending: async (): Promise<any[]> => {
    try {
      const { data } = await supabase.from('advertisements').select('*').eq('is_active', false);
      return data || [];
    } catch {
      return [];
    }
  },

  approve: async (input: { id: string }): Promise<any> => {
    try {
      const { data, error } = await supabase.from('advertisements').update({ is_active: true }).eq('id', input.id).select().single();
      if (error) throw error;
      return data;
    } catch (err) {
      console.error('[advertisementsApi.approve] error:', err);
      throw err;
    }
  },

  reject: async (input: { id: string }): Promise<{ success: boolean }> => {
    try {
      await supabase.from('advertisements').delete().eq('id', input.id);
      return { success: true };
    } catch (err) {
      console.error('[advertisementsApi.reject] error:', err);
      throw err;
    }
  },

  recordImpression: async (input: { id: string }): Promise<{ success: boolean }> => {
    try {
      const { data: ad } = await supabase.from('advertisements').select('impressions').eq('id', input.id).single();
      if (ad) {
        await supabase.from('advertisements').update({ impressions: (ad.impressions || 0) + 1 }).eq('id', input.id);
      }
      return { success: true };
    } catch {
      return { success: true };
    }
  },

  recordClick: async (input: { id: string }): Promise<{ success: boolean }> => {
    try {
      const { data: ad } = await supabase.from('advertisements').select('clicks').eq('id', input.id).single();
      if (ad) {
        await supabase.from('advertisements').update({ clicks: (ad.clicks || 0) + 1 }).eq('id', input.id);
      }
      return { success: true };
    } catch {
      return { success: true };
    }
  },

  stats: async (input: { id: string }): Promise<any> => {
    try {
      const { data: ad } = await supabase.from('advertisements').select('*').eq('id', input.id).single();
      if (!ad) throw new Error('Advertisement not found');

      const ctr = ad.impressions > 0 ? (ad.clicks / ad.impressions) * 100 : 0;
      const costPerClick = ad.clicks > 0 ? ad.budget / ad.clicks : 0;
      const costPerImpression = ad.impressions > 0 ? ad.budget / ad.impressions : 0;

      return {
        impressions: ad.impressions,
        clicks: ad.clicks,
        ctr: parseFloat(ctr.toFixed(2)),
        budget: ad.budget,
        spent: ad.budget,
        costPerClick: parseFloat(costPerClick.toFixed(2)),
        costPerImpression: parseFloat(costPerImpression.toFixed(4)),
      };
    } catch (err) {
      console.error('[advertisementsApi.stats] error:', err);
      throw err;
    }
  },
};

export const socialApi = {
  follow: async (input: { userId: string; promoterId?: string }): Promise<{ success: boolean }> => {
    try {
      await supabase.from('following').insert({
        id: genId('follow'),
        user_id: input.userId,
        promoter_id: input.promoterId || null,
        followed_at: new Date().toISOString(),
      });
      return { success: true };
    } catch {
      return { success: true };
    }
  },

  unfollow: async (input: { userId: string; promoterId?: string }): Promise<{ success: boolean }> => {
    try {
      await supabase.from('following')
        .delete()
        .eq('user_id', input.userId)
        .eq('promoter_id', input.promoterId || '');
      return { success: true };
    } catch {
      return { success: true };
    }
  },

  isFollowing: async (input: { userId: string; promoterId: string }): Promise<{ isFollowing: boolean }> => {
    try {
      const { data } = await supabase.from('following')
        .select('id')
        .eq('user_id', input.userId)
        .eq('promoter_id', input.promoterId)
        .maybeSingle();
      return { isFollowing: !!data };
    } catch {
      return { isFollowing: false };
    }
  },

  getFollowing: async (input: { userId: string }): Promise<any[]> => {
    try {
      const { data } = await supabase.from('following')
        .select('*, promoters(*)')
        .eq('user_id', input.userId);
      return (data || []).map((f: any) => ({
        id: f.id,
        promoterId: f.promoter_id,
        promoter: f.promoters ? {
          id: f.promoters.id, name: f.promoters.name, image: f.promoters.image,
          description: f.promoters.description, verified: f.promoters.verified,
          followersCount: f.promoters.followers_count,
        } : null,
        followedAt: f.followed_at,
      }));
    } catch {
      return [];
    }
  },

  getFollowers: async (input: { promoterId: string }): Promise<any[]> => {
    try {
      const { data } = await supabase.from('following')
        .select('*, users(*)')
        .eq('promoter_id', input.promoterId);
      return data || [];
    } catch {
      return [];
    }
  },
};

export const notificationsApi = {
  list: async (input: { userId: string }): Promise<any[]> => {
    try {
      const { data } = await supabase.from('notifications')
        .select('*')
        .eq('user_id', input.userId)
        .order('created_at', { ascending: false });
      return (data || []).map((n: any) => ({
        id: n.id, userId: n.user_id, type: n.type, title: n.title,
        message: n.message, data: n.data ? safeJsonParse(n.data, null) : null,
        isRead: n.is_read, createdAt: n.created_at,
      }));
    } catch {
      return [];
    }
  },

  registerToken: async (input: { userId: string; token: string; platform: string }): Promise<{ success: boolean }> => {
    try {
      await supabase.from('push_tokens').upsert({
        id: `token_${input.userId}_${input.platform}`,
        user_id: input.userId,
        token: input.token,
        platform: input.platform,
        is_active: true,
        last_used: new Date().toISOString(),
      });
      return { success: true };
    } catch {
      return { success: true };
    }
  },

  send: async (input: any): Promise<{ success: boolean }> => {
    try {
      if (input.userId && input.title && input.message) {
        await supabase.from('notifications').insert({
          id: genId('notif'),
          user_id: input.userId,
          type: input.type || 'general',
          title: input.title,
          message: input.message,
          data: input.data ? JSON.stringify(input.data) : null,
          is_read: false,
        });
      }
      return { success: true };
    } catch {
      return { success: true };
    }
  },

  markRead: async (input: { id: string }): Promise<{ success: boolean }> => {
    try {
      await supabase.from('notifications').update({ is_read: true }).eq('id', input.id);
      return { success: true };
    } catch {
      return { success: true };
    }
  },
};

export const paymentMethodsApi = {
  list: async (input: { userId: string }): Promise<any[]> => {
    try {
      const { data } = await supabase.from('payment_methods')
        .select('*')
        .eq('user_id', input.userId)
        .order('created_at', { ascending: false });
      return (data || []).map((pm: any) => ({
        id: pm.id, userId: pm.user_id, type: pm.type, isPrimary: pm.is_primary,
        accountHolderName: pm.account_holder_name, bankName: pm.bank_name,
        iban: pm.iban, swift: pm.swift, phoneNumber: pm.phone_number,
        email: pm.email, accountId: pm.account_id, isVerified: pm.is_verified,
        createdAt: pm.created_at, updatedAt: pm.updated_at,
      }));
    } catch {
      return [];
    }
  },

  create: async (input: any): Promise<any> => {
    try {
      const id = genId('pm');
      const { data } = await supabase.from('payment_methods').insert({
        id,
        user_id: input.userId,
        type: input.type,
        is_primary: input.isPrimary || false,
        account_holder_name: input.accountHolderName,
        bank_name: input.bankName,
        iban: input.iban,
        swift: input.swift,
        phone_number: input.phoneNumber,
        email: input.email,
        account_id: input.accountId,
      }).select().single();
      return data || { id, ...input };
    } catch {
      return { id: genId('pm'), ...input };
    }
  },

  update: async (input: any): Promise<any> => {
    try {
      await supabase.from('payment_methods').update({
        type: input.type,
        account_holder_name: input.accountHolderName,
        bank_name: input.bankName,
        iban: input.iban,
        swift: input.swift,
        phone_number: input.phoneNumber,
        email: input.email,
        updated_at: new Date().toISOString(),
      }).eq('id', input.id);
      return { success: true };
    } catch {
      return { success: true };
    }
  },

  delete: async (input: { id: string }): Promise<{ success: boolean }> => {
    try {
      await supabase.from('payment_methods').delete().eq('id', input.id);
      return { success: true };
    } catch {
      return { success: true };
    }
  },

  setPrimary: async (input: { id: string; userId: string }): Promise<{ success: boolean }> => {
    try {
      await supabase.from('payment_methods').update({ is_primary: false }).eq('user_id', input.userId);
      await supabase.from('payment_methods').update({ is_primary: true }).eq('id', input.id);
      return { success: true };
    } catch {
      return { success: true };
    }
  },
};

export const affiliatesApi = {
  create: async (input: { userId: string; code: string; commissionRate?: number }): Promise<{ id: string; success: boolean }> => {
    try {
      const id = genId('affiliate');
      const { error } = await supabase.from('affiliates').insert({
        id,
        user_id: input.userId,
        code: input.code,
        commission_rate: input.commissionRate ?? 0.1,
        total_earnings: 0,
        total_sales: 0,
        is_active: true,
      });
      if (error) throw error;
      return { id, success: true };
    } catch (err) {
      console.error('[affiliatesApi.create] error:', err);
      throw err;
    }
  },

  getByUser: async (input: { userId: string }): Promise<any> => {
    try {
      const { data } = await supabase.from('affiliates').select('*').eq('user_id', input.userId).single();
      return data || null;
    } catch {
      return null;
    }
  },

  getByCode: async (input: { code: string }): Promise<any> => {
    try {
      const { data } = await supabase.from('affiliates').select('*').eq('code', input.code).single();
      return data || null;
    } catch {
      return null;
    }
  },

  recordSale: async (input: { affiliateId: string; ticketId: string; commission: number }): Promise<{ id: string; success: boolean }> => {
    try {
      const id = genId('aff_sale');
      await supabase.from('affiliate_sales').insert({
        id,
        affiliate_id: input.affiliateId,
        ticket_id: input.ticketId,
        commission: input.commission,
        status: 'pending',
      });

      const { data: affiliate } = await supabase.from('affiliates').select('total_earnings, total_sales').eq('id', input.affiliateId).single();
      if (affiliate) {
        await supabase.from('affiliates').update({
          total_earnings: (affiliate.total_earnings || 0) + input.commission,
          total_sales: (affiliate.total_sales || 0) + 1,
        }).eq('id', input.affiliateId);
      }

      return { id, success: true };
    } catch (err) {
      console.error('[affiliatesApi.recordSale] error:', err);
      throw err;
    }
  },

  stats: async (input: { userId: string }): Promise<any> => {
    try {
      const { data } = await supabase.from('affiliates').select('*').eq('user_id', input.userId).single();
      if (!data) return null;
      return {
        code: data.code,
        totalEarnings: data.total_earnings,
        totalSales: data.total_sales,
        commissionRate: data.commission_rate,
        isActive: data.is_active,
      };
    } catch {
      return null;
    }
  },
};

export const bundlesApi = {
  create: async (input: { name: string; description: string; eventIds: string[]; discount: number; image: string; validUntil: string }): Promise<{ id: string; success: boolean }> => {
    try {
      const id = genId('bundle');
      const { error } = await supabase.from('event_bundles').insert({
        id,
        name: input.name,
        description: input.description,
        event_ids: JSON.stringify(input.eventIds),
        discount: input.discount,
        image: input.image,
        is_active: true,
        valid_until: input.validUntil,
      });
      if (error) throw error;
      return { id, success: true };
    } catch (err) {
      console.error('[bundlesApi.create] error:', err);
      throw err;
    }
  },

  list: async (input?: { activeOnly?: boolean }): Promise<any[]> => {
    try {
      let query = supabase.from('event_bundles').select('*');
      if (input?.activeOnly !== false) {
        query = query.eq('is_active', true).gte('valid_until', new Date().toISOString());
      }

      const { data, error } = await query;
      if (error) return [];
      return (data || []).map((b: any) => ({
        ...b,
        eventIds: safeJsonParse(b.event_ids, []),
      }));
    } catch {
      return [];
    }
  },

  get: async (input: { id: string }): Promise<any> => {
    try {
      const { data } = await supabase.from('event_bundles').select('*').eq('id', input.id).single();
      if (!data) throw new Error('Bundle not found');
      return { ...data, eventIds: safeJsonParse(data.event_ids, []) };
    } catch (err) {
      console.error('[bundlesApi.get] error:', err);
      throw err;
    }
  },
};

export const priceAlertsApi = {
  create: async (input: { userId: string; eventId: string; targetPrice: number }): Promise<{ id: string; success: boolean }> => {
    try {
      const id = genId('price_alert');
      const { error } = await supabase.from('price_alerts').insert({
        id,
        user_id: input.userId,
        event_id: input.eventId,
        target_price: input.targetPrice,
        is_active: true,
      });
      if (error) throw error;
      return { id, success: true };
    } catch (err) {
      console.error('[priceAlertsApi.create] error:', err);
      throw err;
    }
  },

  list: async (input: { userId: string }): Promise<any[]> => {
    try {
      const { data } = await supabase.from('price_alerts').select('*').eq('user_id', input.userId);
      return data || [];
    } catch {
      return [];
    }
  },

  delete: async (input: { id: string }): Promise<{ success: boolean }> => {
    try {
      await supabase.from('price_alerts').delete().eq('id', input.id);
      return { success: true };
    } catch (err) {
      console.error('[priceAlertsApi.delete] error:', err);
      throw err;
    }
  },
};

export const identityApi = {
  createVerification: async (input: { userId: string; documentType: string; documentNumber: string }): Promise<{ id: string; success: boolean }> => {
    try {
      const id = genId('verification');
      const { error } = await supabase.from('identity_verifications').insert({
        id,
        user_id: input.userId,
        document_type: input.documentType,
        document_number: input.documentNumber,
        status: 'pending',
      });
      if (error) throw error;
      return { id, success: true };
    } catch (err) {
      console.error('[identityApi.createVerification] error:', err);
      throw err;
    }
  },

  getStatus: async (input: { userId: string }): Promise<any> => {
    try {
      const { data } = await supabase.from('identity_verifications').select('*').eq('user_id', input.userId).order('created_at', { ascending: false }).limit(1).single();
      return data || null;
    } catch {
      return null;
    }
  },
};

export const recommendationsApi = {
  smart: async (input: { userId: string; limit?: number; includeReasons?: boolean }): Promise<{ recommendations: any[] }> => {
    try {
      const { data: user } = await supabase.from('users').select('*').eq('id', input.userId).single();
      if (!user) return { recommendations: [] };

      const { data: userTickets } = await supabase.from('tickets').select('event_id').eq('user_id', input.userId);
      const ticketEventIds = (userTickets || []).map((t: any) => t.event_id);

      let pastCategories: string[] = [];
      if (ticketEventIds.length > 0) {
        const { data: pastEvents } = await supabase.from('events').select('category').in('id', ticketEventIds);
        pastCategories = (pastEvents || []).map((e: any) => e.category).filter(Boolean);
      }

      const userInterests = safeJsonParse(user.interests, []);
      const userLocation = user.location_city || '';

      const { data: upcomingEvents } = await supabase
        .from('events')
        .select('*, promoters(*)')
        .eq('status', 'published')
        .gte('date', new Date().toISOString())
        .order('date', { ascending: true })
        .limit(100);

      if (!upcomingEvents || upcomingEvents.length === 0) return { recommendations: [] };

      const includeReasons = input.includeReasons !== false;
      const scored = upcomingEvents.map((event: any) => {
        let score = 0;
        const reasons: string[] = [];
        const eventTags = safeJsonParse<string[]>(event.tags, []);

        if (Array.isArray(userInterests) && userInterests.some((i: string) => eventTags.includes(i))) {
          score += 30;
          reasons.push('Corresponde aos teus interesses');
        }
        if (pastCategories.includes(event.category)) {
          score += 20;
          reasons.push('Categoria que já assististe antes');
        }
        if (event.venue_city && userLocation && event.venue_city.toLowerCase().includes(userLocation.toLowerCase())) {
          score += 25;
          reasons.push('Perto da tua localização');
        }
        if (event.is_featured) {
          score += 15;
          reasons.push('Evento em destaque');
        }
        const daysUntil = Math.floor((new Date(event.date).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
        if (daysUntil <= 7) {
          score += 10;
          reasons.push('Acontece em breve');
        }
        score += Math.random() * 10;

        return { event: mapDbEventToEvent(event), score, reasons: includeReasons ? reasons : [] };
      });

      scored.sort((a: any, b: any) => b.score - a.score);

      const limit = input.limit || 10;
      const recommendations = scored.slice(0, limit).map((item: any, index: number) => ({
        eventId: item.event.id,
        score: item.score,
        reasons: item.reasons,
        rank: index + 1,
        basedOn: item.reasons.includes('Corresponde aos teus interesses') ? 'interests'
          : item.reasons.includes('Perto da tua localização') ? 'location'
          : item.reasons.includes('Categoria que já assististe antes') ? 'history'
          : item.reasons.includes('Evento em destaque') ? 'featured'
          : 'mixed' as const,
        event: item.event,
      }));

      return { recommendations };
    } catch (err) {
      console.error('[recommendationsApi.smart] error:', err);
      return { recommendations: [] };
    }
  },

  ai: async (input: { userId: string; limit?: number }): Promise<{ recommendations: any[] }> => {
    return recommendationsApi.smart({ ...input, includeReasons: true });
  },
};

export const analyticsApi = {
  dashboard: async (input?: { period?: 'week' | 'month' | 'year' }): Promise<any> => {
    try {
      const period = input?.period || 'month';
      const now = new Date();
      let startDate = new Date(0);
      if (period === 'week') startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      else if (period === 'month') startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      else if (period === 'year') startDate = new Date(now.getFullYear(), 0, 1);
      const startDateIso = startDate.toISOString();

      const { count: totalUsers } = await supabase.from('users').select('*', { count: 'exact', head: true });
      const { count: totalEvents } = await supabase.from('events').select('*', { count: 'exact', head: true });
      const { count: pendingEvents } = await supabase.from('events').select('*', { count: 'exact', head: true }).eq('status', 'pending');
      const { count: pendingPromoters } = await supabase.from('promoter_profiles').select('*', { count: 'exact', head: true }).eq('is_approved', false);

      const { count: totalTickets } = await supabase.from('tickets').select('*', { count: 'exact', head: true });
      const { count: periodTickets } = await supabase.from('tickets').select('*', { count: 'exact', head: true }).gte('purchase_date', startDateIso);

      const { data: ticketRevenue } = await supabase.from('tickets').select('price, quantity');
      let totalRevenue = 0;
      let totalCommission = 0;
      (ticketRevenue || []).forEach((t: any) => {
        const lineGross = (t.price || 0) * (t.quantity || 0);
        totalRevenue += lineGross;
        totalCommission += calculateTicketCommission(t.price || 0) * (t.quantity || 0);
      });
      totalRevenue = roundCurrency(totalRevenue);
      totalCommission = roundCurrency(totalCommission);

      const { data: periodTicketRevenue } = await supabase.from('tickets').select('price, quantity').gte('purchase_date', startDateIso);
      const periodRevenue = (periodTicketRevenue || []).reduce((sum: number, t: any) => sum + ((t.price || 0) * (t.quantity || 0)), 0);

      const { count: activeAds } = await supabase.from('advertisements').select('*', { count: 'exact', head: true }).eq('is_active', true);

      return {
        totalUsers: totalUsers || 0,
        totalEvents: totalEvents || 0,
        totalTickets: totalTickets || 0,
        totalRevenue,
        totalCommission,
        netToPromoters: roundCurrency(totalRevenue - totalCommission),
        pendingEvents: pendingEvents || 0,
        pendingPromoters: pendingPromoters || 0,
        activeAds: activeAds || 0,
        periodTickets: periodTickets || 0,
        periodRevenue,
        period,
      };
    } catch {
      return { totalUsers: 0, totalEvents: 0, totalTickets: 0, totalRevenue: 0, totalCommission: 0, netToPromoters: 0, pendingEvents: 0, pendingPromoters: 0, activeAds: 0, periodTickets: 0, periodRevenue: 0, period: input?.period || 'month' };
    }
  },

  events: async (): Promise<any> => {
    try {
      const { data: rawEvents } = await supabase.from('events').select('id, title, category, status, date, is_featured, promoter_id, venue_name, venue_city').order('date', { ascending: false }).limit(50);
      if (!rawEvents || rawEvents.length === 0) return { events: [] };

      const eventIds = rawEvents.map((e: any) => e.id);
      const { data: tickets } = await supabase.from('tickets').select('event_id, quantity, price').in('event_id', eventIds);

      const statsMap: Record<string, { ticketsSold: number; revenue: number }> = {};
      (tickets || []).forEach((t: any) => {
        if (!statsMap[t.event_id]) statsMap[t.event_id] = { ticketsSold: 0, revenue: 0 };
        statsMap[t.event_id].ticketsSold += t.quantity || 0;
        statsMap[t.event_id].revenue += (t.price || 0) * (t.quantity || 0);
      });

      const events = rawEvents.map((e: any) => ({
        ...e,
        ticketsSold: statsMap[e.id]?.ticketsSold || 0,
        revenue: statsMap[e.id]?.revenue || 0,
      }));

      events.sort((a: any, b: any) => b.revenue - a.revenue);

      return { events };
    } catch {
      return { events: [] };
    }
  },

  /**
   * Detailed purchase stats for a single event: totals (sold, revenue,
   * commission, net to promoter), per-ticket-type breakdown and the buyer
   * list. Commission is charged per ticket unit using the tier table.
   */
  eventStats: async (input: { eventId: string }): Promise<any> => {
    const empty = {
      totalSold: 0, totalRevenue: 0, totalCommission: 0, netToPromoter: 0,
      validatedCount: 0, perType: [] as any[], buyers: [] as any[],
    };
    try {
      if (!input?.eventId) return empty;

      const { data: event } = await supabase
        .from('events')
        .select('id, title, ticket_types')
        .eq('id', input.eventId)
        .single();

      const ticketTypes: any[] = Array.isArray(event?.ticket_types) ? event.ticket_types : [];
      const typeById = new Map<string, any>();
      ticketTypes.forEach((t: any, idx: number) => {
        typeById.set(t.id || `tt-${event?.id ?? input.eventId}-${idx}`, {
          id: t.id || `tt-${event?.id ?? input.eventId}-${idx}`,
          name: t.name || 'Bilhete',
          price: t.price || 0,
          available: t.available ?? 0,
        });
      });

      const { data: tickets, error } = await supabase
        .from('tickets')
        .select('id, user_id, ticket_type_id, quantity, price, is_used, validated_at, purchase_date, qr_code, users(name, email, phone)')
        .eq('event_id', input.eventId)
        .order('purchase_date', { ascending: false });

      if (error) {
        console.error('[analyticsApi.eventStats] Supabase error:', error.message);
        return empty;
      }

      let totalSold = 0;
      let totalRevenue = 0;
      let totalCommission = 0;
      let validatedCount = 0;
      const typeStats = new Map<string, { ticketTypeId: string; name: string; unitPrice: number; sold: number; revenue: number; commission: number; available: number }>();

      const buyers = (tickets || []).map((t: any) => {
        const typeName = typeById.get(t.ticket_type_id)?.name || 'Bilhete';
        const unitPrice = t.price || 0;
        const quantity = t.quantity || 0;
        const lineRevenue = unitPrice * quantity;
        const lineCommission = calculateTicketCommission(unitPrice) * quantity;

        totalSold += quantity;
        totalRevenue += lineRevenue;
        totalCommission += lineCommission;
        if (t.is_used) validatedCount += quantity;

        if (!typeStats.has(t.ticket_type_id)) {
          const tt = typeById.get(t.ticket_type_id);
          typeStats.set(t.ticket_type_id, {
            ticketTypeId: t.ticket_type_id,
            name: typeName,
            unitPrice,
            sold: 0, revenue: 0, commission: 0,
            available: tt?.available ?? 0,
          });
        }
        const ts = typeStats.get(t.ticket_type_id)!;
        ts.sold += quantity;
        ts.revenue += lineRevenue;
        ts.commission += lineCommission;

        return {
          id: t.id,
          userId: t.user_id,
          name: t.users?.name || 'Comprador',
          email: t.users?.email || '',
          phone: t.users?.phone || '',
          ticketTypeId: t.ticket_type_id,
          ticketType: typeName,
          quantity,
          unitPrice,
          purchaseDate: t.purchase_date,
          totalPaid: lineRevenue,
          qrCode: t.qr_code,
          isValidated: !!t.is_used,
          validatedAt: t.validated_at || undefined,
        };
      });

      return {
        totalSold,
        totalRevenue: roundCurrency(totalRevenue),
        totalCommission: roundCurrency(totalCommission),
        netToPromoter: roundCurrency(totalRevenue - totalCommission),
        validatedCount,
        perType: Array.from(typeStats.values()).map((ts) => ({
          ...ts,
          revenue: roundCurrency(ts.revenue),
          commission: roundCurrency(ts.commission),
        })),
        buyers,
      };
    } catch (err) {
      console.error('[analyticsApi.eventStats] error:', err);
      return empty;
    }
  },

  /**
   * Aggregated real sales stats across ALL events of one promoter:
   * gross revenue (valor comprado), Lyven commission and net to promoter,
   * plus a per-event breakdown.
   */
  promoterStats: async (input: { promoterId: string }): Promise<any> => {
    const empty = {
      totalSold: 0, grossRevenue: 0, totalCommission: 0, netToPromoter: 0,
      perEvent: [] as any[],
    };
    try {
      if (!input?.promoterId) return empty;

      const { data, error } = await supabase
        .from('tickets')
        .select('id, event_id, ticket_type_id, quantity, price, purchase_date, events(id, title, date, promoter_id)');

      if (error) {
        console.error('[analyticsApi.promoterStats] Supabase error:', error.message);
        return empty;
      }

      const perEvent = new Map<string, { eventId: string; title: string; date: string; sold: number; gross: number; commission: number }>();
      let totalSold = 0;
      let grossRevenue = 0;
      let totalCommission = 0;

      (data || []).forEach((t: any) => {
        const event = t.events;
        if (!event || event.promoter_id !== input.promoterId) return;
        const quantity = t.quantity || 0;
        const unitPrice = t.price || 0;
        const lineGross = unitPrice * quantity;
        const lineCommission = calculateTicketCommission(unitPrice) * quantity;

        totalSold += quantity;
        grossRevenue += lineGross;
        totalCommission += lineCommission;

        if (!perEvent.has(event.id)) {
          perEvent.set(event.id, {
            eventId: event.id,
            title: event.title || 'Evento',
            date: event.date,
            sold: 0, gross: 0, commission: 0,
          });
        }
        const es = perEvent.get(event.id)!;
        es.sold += quantity;
        es.gross += lineGross;
        es.commission += lineCommission;
      });

      return {
        totalSold,
        grossRevenue: roundCurrency(grossRevenue),
        totalCommission: roundCurrency(totalCommission),
        netToPromoter: roundCurrency(grossRevenue - totalCommission),
        perEvent: Array.from(perEvent.values()).map((es) => ({
          ...es,
          gross: roundCurrency(es.gross),
          commission: roundCurrency(es.commission),
          net: roundCurrency(es.gross - es.commission),
        })).sort((a, b) => b.gross - a.gross),
      };
    } catch (err) {
      console.error('[analyticsApi.promoterStats] error:', err);
      return empty;
    }
  },

  promoters: async (): Promise<any> => {
    try {
      const { data } = await supabase.from('promoters').select('*');
      return { promoters: data || [] };
    } catch {
      return { promoters: [] };
    }
  },

  revenue: async (input?: { period?: 'week' | 'month' | 'year' }): Promise<any> => {
    try {
      const period = input?.period || 'month';
      const now = new Date();
      let startDate = new Date(0);
      if (period === 'week') startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      else if (period === 'month') startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      else if (period === 'year') startDate = new Date(now.getFullYear(), 0, 1);

      const { data } = await supabase.from('tickets')
        .select('price, quantity, purchase_date')
        .gte('purchase_date', startDate.toISOString())
        .order('purchase_date', { ascending: false });
      return { revenue: data || [] };
    } catch {
      return { revenue: [] };
    }
  },

  users: async (): Promise<any> => {
    try {
      const { data } = await supabase.from('users').select('id, name, email, user_type, created_at').order('created_at', { ascending: false }).limit(50);
      return { users: data || [] };
    } catch {
      return { users: [] };
    }
  },

  commissions: async (input?: { period?: 'week' | 'month' | 'year' }): Promise<any> => {
    try {
      const period = input?.period || 'month';
      const now = new Date();
      let startDate = new Date(0);
      if (period === 'week') startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      else if (period === 'month') startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      else if (period === 'year') startDate = new Date(now.getFullYear(), 0, 1);

      const { data: tickets } = await supabase.from('tickets')
        .select('id, event_id, price, quantity, purchase_date')
        .gte('purchase_date', startDate.toISOString())
        .order('purchase_date', { ascending: false });

      if (!tickets || tickets.length === 0) {
        return {
          totalCommission: 0,
          totalVolume: 0,
          tier1Count: 0, tier1Commission: 0,
          tier2Count: 0, tier2Commission: 0,
          tier3Count: 0, tier3Commission: 0,
          perEvent: [],
        };
      }

      const tiers = [
        { name: 'Até €20.00', min: 0, max: 20, percent: 0.05, fixed: 0.50 },
        { name: '€20.01 - €50.00', min: 20.01, max: 50, percent: 0.045, fixed: 0.60 },
        { name: 'Acima de €50.00', min: 50.01, max: Infinity, percent: 0.035, fixed: 1.00 },
      ];

      const calcCommission = (price: number): { tier: number; commission: number } => {
        for (let i = 0; i < tiers.length; i++) {
          if (price >= tiers[i].min && price <= tiers[i].max) {
            return { tier: i, commission: price * tiers[i].percent + tiers[i].fixed };
          }
        }
        const last = tiers[tiers.length - 1];
        return { tier: tiers.length - 1, commission: price * last.percent + last.fixed };
      };

      let totalCommission = 0;
      let totalVolume = 0;
      const tierCounts = [0, 0, 0];
      const tierCommissions = [0, 0, 0];
      const eventMap: Record<string, { eventId: string; volume: number; commission: number; ticketCount: number }> = {};

      for (const t of tickets) {
        const price = t.price || 0;
        const qty = t.quantity || 1;
        const lineTotal = price * qty;
        totalVolume += lineTotal;

        for (let q = 0; q < qty; q++) {
          const { tier, commission } = calcCommission(price);
          totalCommission += commission;
          tierCounts[tier]++;
          tierCommissions[tier] += commission;

          if (!eventMap[t.event_id]) {
            eventMap[t.event_id] = { eventId: t.event_id, volume: 0, commission: 0, ticketCount: 0 };
          }
          eventMap[t.event_id].volume += price;
          eventMap[t.event_id].commission += commission;
          eventMap[t.event_id].ticketCount++;
        }
      }

      const eventIds = Object.keys(eventMap);
      const { data: eventData } = await supabase.from('events')
        .select('id, title').in('id', eventIds);
      const eventTitleMap: Record<string, string> = {};
      (eventData || []).forEach((e: any) => { eventTitleMap[e.id] = e.title || 'Sem título'; });

      const perEvent = Object.values(eventMap)
        .map(e => ({ ...e, title: eventTitleMap[e.eventId] || 'Sem título' }))
        .sort((a, b) => b.commission - a.commission)
        .slice(0, 10);

      return {
        totalCommission: parseFloat(totalCommission.toFixed(2)),
        totalVolume: parseFloat(totalVolume.toFixed(2)),
        tier1Count: tierCounts[0], tier1Commission: parseFloat(tierCommissions[0].toFixed(2)),
        tier2Count: tierCounts[1], tier2Commission: parseFloat(tierCommissions[1].toFixed(2)),
        tier3Count: tierCounts[2], tier3Commission: parseFloat(tierCommissions[2].toFixed(2)),
        perEvent,
      };
    } catch {
      return { totalCommission: 0, totalVolume: 0, tier1Count: 0, tier1Commission: 0, tier2Count: 0, tier2Commission: 0, tier3Count: 0, tier3Commission: 0, perEvent: [] };
    }
  },
};

export const adminSettingsApi = {
  get: async (): Promise<any> => {
    try {
      const { data, error } = await supabase
        .from('admin_settings')
        .select('*')
        .eq('id', 'global')
        .maybeSingle();
      if (error) {
        console.error('[adminSettingsApi.get] error:', error.message);
        return null;
      }
      if (data) {
        return {
          notifications: {
            emailNotifications: data.email_notifications ?? true,
            pushNotifications: data.push_notifications ?? true,
            smsNotifications: data.sms_notifications ?? false,
            adminAlerts: data.admin_alerts ?? true,
          },
          platform: {
            maintenanceMode: data.maintenance_mode ?? false,
            registrationEnabled: data.registration_enabled ?? true,
            eventCreationEnabled: data.event_creation_enabled ?? true,
            paymentProcessing: data.payment_processing ?? true,
          },
          security: {
            twoFactorRequired: data.two_factor_required ?? false,
            passwordComplexity: data.password_complexity ?? true,
            sessionTimeout: data.session_timeout ?? 30,
            maxLoginAttempts: data.max_login_attempts ?? 5,
          },
          business: {
            platformFee: data.platform_fee ?? 5.0,
            promoterCommission: data.promoter_commission ?? 85.0,
            refundPolicy: data.refund_policy_days ?? 7,
            eventApprovalRequired: data.event_approval_required ?? true,
          },
          content: {
            autoModeration: data.auto_moderation ?? true,
            profanityFilter: data.profanity_filter ?? true,
            imageModeration: data.image_moderation ?? true,
            reportThreshold: data.report_threshold ?? 3,
          },
          updatedAt: data.updated_at,
        };
      }
      return null;
    } catch (err) {
      console.error('[adminSettingsApi.get] error:', err);
      return null;
    }
  },

  update: async (input: any): Promise<{ success: boolean }> => {
    try {
      const updates: Record<string, any> = {
        id: 'global',
        updated_at: new Date().toISOString(),
      };
      if (input.notifications) {
        const n = input.notifications;
        if (n.emailNotifications !== undefined) updates.email_notifications = n.emailNotifications;
        if (n.pushNotifications !== undefined) updates.push_notifications = n.pushNotifications;
        if (n.smsNotifications !== undefined) updates.sms_notifications = n.smsNotifications;
        if (n.adminAlerts !== undefined) updates.admin_alerts = n.adminAlerts;
      }
      if (input.platform) {
        const p = input.platform;
        if (p.maintenanceMode !== undefined) updates.maintenance_mode = p.maintenanceMode;
        if (p.registrationEnabled !== undefined) updates.registration_enabled = p.registrationEnabled;
        if (p.eventCreationEnabled !== undefined) updates.event_creation_enabled = p.eventCreationEnabled;
        if (p.paymentProcessing !== undefined) updates.payment_processing = p.paymentProcessing;
      }
      if (input.security) {
        const s = input.security;
        if (s.twoFactorRequired !== undefined) updates.two_factor_required = s.twoFactorRequired;
        if (s.passwordComplexity !== undefined) updates.password_complexity = s.passwordComplexity;
        if (s.sessionTimeout !== undefined) updates.session_timeout = s.sessionTimeout;
        if (s.maxLoginAttempts !== undefined) updates.max_login_attempts = s.maxLoginAttempts;
      }
      if (input.business) {
        const b = input.business;
        if (b.platformFee !== undefined) updates.platform_fee = b.platformFee;
        if (b.promoterCommission !== undefined) updates.promoter_commission = b.promoterCommission;
        if (b.refundPolicy !== undefined) updates.refund_policy_days = b.refundPolicy;
        if (b.eventApprovalRequired !== undefined) updates.event_approval_required = b.eventApprovalRequired;
      }
      if (input.content) {
        const c = input.content;
        if (c.autoModeration !== undefined) updates.auto_moderation = c.autoModeration;
        if (c.profanityFilter !== undefined) updates.profanity_filter = c.profanityFilter;
        if (c.imageModeration !== undefined) updates.image_moderation = c.imageModeration;
        if (c.reportThreshold !== undefined) updates.report_threshold = c.reportThreshold;
      }

      const { error } = await supabase.from('admin_settings').upsert(updates);
      if (error) {
        console.error('[adminSettingsApi.update] error:', error.message);
        throw error;
      }
      return { success: true };
    } catch (err) {
      console.error('[adminSettingsApi.update] error:', err);
      throw err;
    }
  },
};

export interface StripeCheckoutItem {
  eventId: string;
  ticketTypeId: string;
  quantity: number;
  seatLabels?: string[];
}

export interface StripeCreateCheckoutInput {
  items: StripeCheckoutItem[];
  userId: string;
  userEmail: string;
  paymentMethod: 'card' | 'mbway' | 'multibanco';
  returnUrl: string;
  cancelUrl: string;
}

function stripeError(err: any): Error {
  // supabase.functions.invoke devolve FunctionsHttpError; extrai a mensagem do corpo.
  const ctx = err?.context;
  if (ctx && typeof ctx.json === 'function') {
    // o corpo já foi consumido em alguns clientes — ignora falhas
  }
  return new Error(err?.message ?? 'Erro de comunicação com o Stripe');
}

export const stripeApi = {
  getConfig: async (): Promise<{ isConfigured: boolean; publishableKey: string | null }> => {
    try {
      const { data, error } = await supabase.functions.invoke('stripe-checkout', {
        body: { action: 'ping' },
      });
      if (error) return { isConfigured: false, publishableKey: null };
      return {
        isConfigured: !!data?.configured,
        publishableKey: data?.publishableKey ?? null,
      };
    } catch {
      return { isConfigured: false, publishableKey: null };
    }
  },

  /** Cria uma sessão Stripe Checkout e devolve o URL da página de pagamento. */
  createCheckout: async (input: StripeCreateCheckoutInput): Promise<{ sessionId: string; url: string }> => {
    const { data, error } = await supabase.functions.invoke('stripe-checkout', {
      body: { action: 'create', ...input },
    });
    if (error) throw stripeError(error);
    if (data?.error) throw new Error(data.error);
    if (!data?.url || !data?.sessionId) throw new Error('Resposta inválida do servidor de pagamentos');
    return { sessionId: data.sessionId, url: data.url };
  },

  /** Consulta o estado de pagamento de uma sessão (usado após regressar do Stripe). */
  getStatus: async (input: { sessionId: string }): Promise<{
    paid: boolean;
    paymentStatus: string;
    amountTotal: number;
    currency: string;
    email: string | null;
  }> => {
    const { data, error } = await supabase.functions.invoke('stripe-checkout', {
      body: { action: 'status', sessionId: input.sessionId },
    });
    if (error) throw stripeError(error);
    if (data?.error) throw new Error(data.error);
    return data;
  },
};

export const emailsApi = {
  sendTest: async (_input: any): Promise<{ success: boolean }> => {
    console.log('[emailsApi.sendTest] Email sending requires Supabase Edge Functions');
    return { success: false };
  },
};

export const exampleApi = {
  hi: async (input?: { name?: string }): Promise<{ greeting: string }> => {
    return { greeting: `Hello ${input?.name || 'World'}! (Supabase direct mode)` };
  },
};

export const webhooksApi = {
  createEvent: async (input: any): Promise<any> => {
    return eventsApi.create(input);
  },
};

/**
 * Seat reservation API for venues with numbered seats (e.g. Teatro Baltazar Dias).
 * Persists per-event seat state in the `event_seats` table.
 */
export const seatsApi = {
  /**
   * Returns the static seat-map layout for a given venue name.
   * For venues we have a hardcoded layout (Baltazar Dias), returns the map; otherwise null.
   */
  getVenueLayout: async (input: { venueName: string }): Promise<{
    seatMapId: string;
    venueName: string;
    sections: any[];
    totalSeats: number;
  } | null> => {
    try {
      const { isBaltazarDiasVenue, BALTAZAR_DIAS_SEAT_MAP, flattenSeats } =
        await import('@/constants/venue-seat-maps');
      if (isBaltazarDiasVenue(input.venueName)) {
        return {
          seatMapId: BALTAZAR_DIAS_SEAT_MAP.id,
          venueName: BALTAZAR_DIAS_SEAT_MAP.venueName,
          sections: BALTAZAR_DIAS_SEAT_MAP.sections,
          totalSeats: flattenSeats(BALTAZAR_DIAS_SEAT_MAP).length,
        };
      }
      return null;
    } catch (err) {
      console.error('[seatsApi.getVenueLayout] error:', err);
      return null;
    }
  },

  /**
   * Ensures the event_seats rows exist for an event at a venue with a seat map.
   * Idempotent: if rows already exist, just returns the current state.
   */
  ensureEventSeats: async (input: {
    eventId: string;
    venueName: string;
  }): Promise<{ initialized: boolean; seats: any[] }> => {
    try {
      // Check if rows already exist for this event
      const { data: existing, error: existingErr } = await supabase
        .from('event_seats')
        .select('*')
        .eq('event_id', input.eventId)
        .limit(1);

      if (existingErr) {
        console.error('[seatsApi.ensureEventSeats] check error:', existingErr.message);
        return { initialized: false, seats: [] };
      }

      if (existing && existing.length > 0) {
        // Already initialized — fetch all
        const { data: all, error: allErr } = await supabase
          .from('event_seats')
          .select('*')
          .eq('event_id', input.eventId)
          .order('sort_index', { ascending: true });
        if (allErr) {
          console.error('[seatsApi.ensureEventSeats] fetch all error:', allErr.message);
          return { initialized: false, seats: [] };
        }
        return { initialized: false, seats: all || [] };
      }

      // Need to initialize. Get the layout.
      const layout = await seatsApi.getVenueLayout({ venueName: input.venueName });
      if (!layout) {
        return { initialized: false, seats: [] };
      }

      const { flattenSeats, BALTAZAR_DIAS_SEAT_MAP } =
        await import('@/constants/venue-seat-maps');
      const map = BALTAZAR_DIAS_SEAT_MAP;
      const allSeats = flattenSeats(map);

      // Insert in batches to avoid payload limits
      const batchSize = 200;
      const rows = allSeats.map((s) => ({
        id: `${input.eventId}_${s.id}`,
        event_id: input.eventId,
        seat_map_id: layout.seatMapId,
        seat_label: s.id,
        section: s.section,
        row_label: s.rowLabel,
        seat_number: s.seatNumber,
        sort_index: s.sortIndex,
        status: 'available',
      }));

      for (let i = 0; i < rows.length; i += batchSize) {
        const batch = rows.slice(i, i + batchSize);
        const { error: insertErr } = await supabase.from('event_seats').insert(batch);
        if (insertErr) {
          console.error('[seatsApi.ensureEventSeats] insert batch error:', insertErr.message);
          // If some rows were already inserted (race), continue gracefully
          if (insertErr.code !== '23505') {
            return { initialized: false, seats: [] };
          }
        }
      }

      const { data: all } = await supabase
        .from('event_seats')
        .select('*')
        .eq('event_id', input.eventId)
        .order('sort_index', { ascending: true });
      return { initialized: true, seats: all || [] };
    } catch (err) {
      console.error('[seatsApi.ensureEventSeats] error:', err);
      return { initialized: false, seats: [] };
    }
  },

  /**
   * Lists all seats for an event with their current status.
   */
  listEventSeats: async (input: { eventId: string }): Promise<any[]> => {
    try {
      const { data, error } = await supabase
        .from('event_seats')
        .select('*')
        .eq('event_id', input.eventId)
        .order('sort_index', { ascending: true });
      if (error) {
        console.error('[seatsApi.listEventSeats] error:', error.message);
        return [];
      }
      return data || [];
    } catch (err) {
      console.error('[seatsApi.listEventSeats] error:', err);
      return [];
    }
  },

  /**
   * Reserves a list of seats for a user (status -> 'reserved' with a TTL).
   * Only succeeds if all seats are currently 'available'.
   */
  reserveSeats: async (input: {
    eventId: string;
    seatLabels: string[];
    userId: string;
    minutes?: number;
  }): Promise<{ success: boolean; reserved: string[]; conflict?: string[] }> => {
    try {
      if (input.seatLabels.length === 0) return { success: true, reserved: [] };

      const ttlMinutes = input.minutes ?? 10;
      const reservedUntil = new Date(Date.now() + ttlMinutes * 60 * 1000).toISOString();

      // Atomic conditional update: only update seats that are still available
      const { data: updated, error } = await supabase
        .from('event_seats')
        .update({
          status: 'reserved',
          reserved_by: input.userId,
          reserved_until: reservedUntil,
          updated_at: new Date().toISOString(),
        })
        .eq('event_id', input.eventId)
        .in('seat_label', input.seatLabels)
        .eq('status', 'available')
        .select('seat_label');

      if (error) {
        console.error('[seatsApi.reserveSeats] error:', error.message);
        return { success: false, reserved: [], conflict: input.seatLabels };
      }

      const reserved = (updated || []).map((r: any) => r.seat_label);
      const conflicts = input.seatLabels.filter((l) => !reserved.includes(l));

      return {
        success: conflicts.length === 0,
        reserved,
        conflict: conflicts,
      };
    } catch (err) {
      console.error('[seatsApi.reserveSeats] error:', err);
      return { success: false, reserved: [], conflict: input.seatLabels };
    }
  },

  /**
   * Releases a list of reserved seats back to 'available'.
   */
  releaseSeats: async (input: {
    eventId: string;
    seatLabels: string[];
  }): Promise<{ success: boolean }> => {
    try {
      if (input.seatLabels.length === 0) return { success: true };
      const { error } = await supabase
        .from('event_seats')
        .update({
          status: 'available',
          reserved_by: null,
          reserved_until: null,
          updated_at: new Date().toISOString(),
        })
        .eq('event_id', input.eventId)
        .in('seat_label', input.seatLabels)
        .eq('status', 'reserved');
      if (error) console.error('[seatsApi.releaseSeats] error:', error.message);
      return { success: !error };
    } catch (err) {
      console.error('[seatsApi.releaseSeats] error:', err);
      return { success: false };
    }
  },

  /**
   * Marks seats as definitively booked after a successful purchase.
   */
  bookSeats: async (input: {
    eventId: string;
    seatLabels: string[];
    userId: string;
  }): Promise<{ success: boolean }> => {
    try {
      if (input.seatLabels.length === 0) return { success: true };
      const { error } = await supabase
        .from('event_seats')
        .update({
          status: 'booked',
          booked_by: input.userId,
          booked_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('event_id', input.eventId)
        .in('seat_label', input.seatLabels);
      if (error) console.error('[seatsApi.bookSeats] error:', error.message);
      return { success: !error };
    } catch (err) {
      console.error('[seatsApi.bookSeats] error:', err);
      return { success: false };
    }
  },
};
