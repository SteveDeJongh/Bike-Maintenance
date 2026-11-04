# Some networks advertise an IPv6 (AAAA) DNS record for a host but don't
# actually route IPv6 traffic -- confirmed happening against Strava's API on
# at least one dev machine. curl works around this with "happy eyeballs"
# (racing IPv4/IPv6 and using whichever connects first), but Ruby's
# Net::HTTP -- what Faraday's default adapter uses for every Strava::Client
# call -- doesn't: it can pick the unreachable IPv6 address and hang for the
# full default open_timeout before failing with "Failed to open TCP
# connection... (execution expired)", surfacing as a 500 mid-OAuth.
#
# Patching Socket.getaddrinfo alone does NOT fix this -- confirmed by
# reading Ruby's own net/http.rb: Net::HTTP#connect calls TCPSocket.open
# directly, which resolves hostnames via its own internal (C-level) address
# lookup, never going through the Ruby-level Socket.getaddrinfo method.
# Patching TCPSocket.open/.new instead -- resolving to an IPv4 address
# ourselves first, then connecting by that IP -- actually intercepts the
# path Net::HTTP uses. The original hostname still reaches Net::HTTP's own
# @address (used for the Host header and TLS SNI), so this only changes
# which IP the raw socket connects to, not what the server sees.
#
# Safe here: the only outbound HTTP calls this app makes are to Strava's
# API, and IPv4 reaches it everywhere IPv6 would.
class TCPSocket
  class << self
    alias_method :_original_open, :open
    alias_method :_original_new, :new

    def _resolve_ipv4_literal(host)
      return host unless host.is_a?(String)
      return host if host =~ /\A[\d.]+\z/ || host.include?(":") # already a literal IPv4/IPv6 address

      Socket.getaddrinfo(host, nil, Socket::AF_INET).first[3]
    end
    private :_resolve_ipv4_literal

    def open(host, port, *rest)
      _original_open(_resolve_ipv4_literal(host), port, *rest)
    end

    def new(host, port, *rest)
      _original_new(_resolve_ipv4_literal(host), port, *rest)
    end
  end
end
