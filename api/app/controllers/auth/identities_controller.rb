class Auth::IdentitiesController < ApplicationController
  # DELETE /me/identities/:provider -- never leaves the user with no way to
  # sign in. "Ways to sign in" = a password, plus every other linked
  # identity besides the one being removed.
  def destroy
    identity = current_user.user_identities.find_by!(provider: params[:provider])
    other_methods = current_user.user_identities.where.not(id: identity.id).count
    other_methods += 1 if current_user.has_password?

    if other_methods.zero?
      return render json: { base: ["Can't remove your last sign-in method"] }, status: :unprocessable_content
    end

    identity.destroy!
    head :no_content
  end
end
