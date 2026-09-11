-- jobPilot shipped connectors for ashby/workable/recruitee/personio, but the enum
-- was never widened, so those connectors could never store a row. Fix that.
alter type ats_source add value if not exists 'ashby';
alter type ats_source add value if not exists 'workable';
alter type ats_source add value if not exists 'recruitee';
alter type ats_source add value if not exists 'personio';

