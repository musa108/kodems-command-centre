-- Human-readable reference counters (created up-front: lazy creation races under concurrency)
CREATE SEQUENCE IF NOT EXISTS ref_seq_inc;
CREATE SEQUENCE IF NOT EXISTS ref_seq_rpt;
CREATE SEQUENCE IF NOT EXISTS ref_seq_tm;
CREATE SEQUENCE IF NOT EXISTS ref_seq_dep;
CREATE SEQUENCE IF NOT EXISTS ref_seq_hh;
CREATE SEQUENCE IF NOT EXISTS ref_seq_per;
CREATE SEQUENCE IF NOT EXISTS ref_seq_ben;
CREATE SEQUENCE IF NOT EXISTS ref_seq_dst;
CREATE SEQUENCE IF NOT EXISTS ref_seq_alc;
CREATE SEQUENCE IF NOT EXISTS ref_seq_shl;
CREATE SEQUENCE IF NOT EXISTS ref_seq_alr;
