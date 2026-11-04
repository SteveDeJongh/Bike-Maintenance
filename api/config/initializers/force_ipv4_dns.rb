# Some networks advertise an IPv6 (AAAA) DNS record for a host but don't
# actually route IPv6 traffic -- confirmed happening against Strava's API
# on at least one dev machine (dig showed AAAA records for www.strava.com,
# but a direct IPv6 connection attempt just hung). curl works around this
# with "happy eyeballs" (racing IPv4/IPv6 and using whichever connects
# first), but Ruby's Net::HTTP -- what Faraday's default adapter uses for
# the Strava API calls in app/services/strava/client.rb -- does not. It can
# pick the unreachable IPv6 address and sit there for the full default
# open_timeout (60s) before failing with "Failed to open TCP connection...
# (execution expired)".
#
# Forcing IPv4-only DNS resolution process-wide sidesteps this. Safe here:
# the only outbound HTTP calls this app makes are to Strava's API, and
# IPv4 reaches it everywhere IPv6 would.
module ForceIPv4DNS
  def getaddrinfo(host, port, _family = nil, *rest)
    super(host, port, Socket::AF_INET, *rest)
  end
end

Socket.singleton_class.prepend(ForceIPv4DNS)
