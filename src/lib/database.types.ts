/**
 * Hand-written to match supabase/migrations/*.sql.
 *
 * There is no live project to run `supabase gen types` against yet. Once one
 * exists, regenerate and delete this file. Until then, keep it in step with the
 * migrations by hand.
 */

export type ProfileRole = "teacher" | "admin";
export type ProfileStatus = "pending" | "approved" | "rejected";
export type SchoolLevelDb = "elementary" | "secondary";
export type ShareStatusDb = "available" | "reserved" | "completed";

type Timestamps = { created_at: string };

export type Profile = Timestamps & {
  id: string;
  email: string;
  full_name: string;
  nickname: string;
  school_id: string | null;
  role: ProfileRole;
  status: ProfileStatus;
  updated_at: string;
};

export type School = {
  id: string;
  kakao_place_id: string;
  name: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
  created_at: string;
};

export type ItemType = {
  id: string;
  label: string;
  carbon_g: number;
  sort_order: number;
  is_active: boolean;
};

export type SharePost = Timestamps & {
  id: string;
  author_id: string;
  title: string;
  description: string;
  school_level: SchoolLevelDb;
  category: string;
  item_type_id: string | null;
  carbon_g: number;
  status: ShareStatusDb;
  reserved_by: string | null;
  reserved_at: string | null;
  completed_at: string | null;
  updated_at: string;
};

export type PostImage = {
  id: string;
  post_id: string;
  storage_path: string;
  sort_order: number;
  created_at: string;
};

export type PostComment = Timestamps & {
  id: string;
  post_id: string;
  author_id: string;
  body: string;
};

export type ClubPost = Timestamps & {
  id: string;
  author_id: string;
  title: string;
  description: string;
  school_level: SchoolLevelDb;
  category: string;
  updated_at: string;
};

export type SchoolReviewQuestion = {
  id: string;
  text: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
};

export type SchoolReview = Timestamps & {
  id: string;
  school_id: string;
  user_id: string;
  updated_at: string;
};

export type SchoolReviewAnswer = {
  id: string;
  review_id: string;
  question_id: string;
  score: number;
};

export type SchoolSearchCache = {
  id: string;
  query_key: string;
  fetched_at: string;
};

export type SchoolSearchCacheItem = {
  id: string;
  cache_id: string;
  school_id: string;
  rank: number;
};

export type UserCarbonTotal = {
  user_id: string;
  total_carbon_g: number;
  completed_count: number;
};

export type SchoolRatingSummary = {
  school_id: string;
  question_id: string | null;
  question_text: string | null;
  question_sort_order: number | null;
  question_is_active: boolean | null;
  average_score: number | null;
  answer_count: number;
  reviewer_count: number;
};

type Table<Row, Insert = Partial<Row>, Update = Partial<Row>> = {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: [];
};

type View<Row> = { Row: Row; Relationships: [] };

export type Database = {
  public: {
    Tables: {
      profiles: Table<Profile>;
      schools: Table<School>;
      item_types: Table<ItemType>;
      share_posts: Table<SharePost>;
      share_post_images: Table<PostImage>;
      share_comments: Table<PostComment>;
      club_posts: Table<ClubPost>;
      club_post_images: Table<PostImage>;
      club_comments: Table<PostComment>;
      school_review_questions: Table<SchoolReviewQuestion>;
      school_reviews: Table<SchoolReview>;
      school_review_answers: Table<SchoolReviewAnswer>;
      school_search_cache: Table<SchoolSearchCache>;
      school_search_cache_items: Table<SchoolSearchCacheItem>;
    };
    Views: {
      user_carbon_totals: View<UserCarbonTotal>;
      school_rating_summary: View<SchoolRatingSummary>;
    };
    Functions: {
      is_approved: { Args: Record<string, never>; Returns: boolean };
      is_admin: { Args: Record<string, never>; Returns: boolean };
      nickname_available: { Args: { candidate: string }; Returns: boolean };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
